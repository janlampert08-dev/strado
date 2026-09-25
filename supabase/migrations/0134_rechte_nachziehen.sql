-- Rechte nachziehen: drei kleine Luecken in Grants und einer Hilfsfunktion.
--
-- GEMESSEN am 2026-09-25 (Produktion, nur SELECT; information_schema.
-- column_privileges / role_table_grants, pg_policies, pg_get_functiondef),
-- NACH 0139_rls_policies_aufgeraeumt:
--
-- (a) profiles.is_moderator ist per Spalten-Grant fuer anon UND authenticated
--     lesbar, und die Select-Policy auf profiles ist "true" — jeder, auch
--     ohne Konto, kann mit dem oeffentlichen Schluessel
--     `profiles?select=id,display_name&is_moderator=eq.true` abfragen und
--     bekommt die Moderatorenkonten aufgelistet. Wer Moderatoren kennt, weiss,
--     wen er fuer Social Engineering oder gezielte Kontouebernahme angehen
--     muss.
--
--     Der Grant laesst sich nicht einfach entziehen: 20 Policies auf 10
--     Tabellen pruefen die Rolle mit
--       exists (select 1 from profiles where id = auth.uid() and is_moderator)
--     und laufen dabei als der Aufrufer. Elf davon gelten fuer die Rolle
--     public, also auch fuer anon — darunter die Select-Policy auf routes
--     ("Strecken sichtbar: freigegeben, eigene, für Moderatoren"). Ohne
--     Spaltenrecht wuerde jede anonyme Streckenabfrage mit "permission denied
--     for table profiles" scheitern: die ganze Karte fuer abgemeldete
--     Besucher.
--
--     Deshalb zuerst public.ist_moderator(): SECURITY DEFINER, liefert nur das
--     Flag des Aufrufers (auth.uid()), fuer anon immer false. Jede der 20
--     Policies bekommt statt des exists-Ausdrucks `(select
--     public.ist_moderator())` — dieselbe Bedeutung, und als initplan einmal
--     pro Abfrage ausgewertet wie das `(select auth.uid())` aus 0139. Erst
--     danach wird der Spalten-Grant entzogen. Die App liest das eigene Flag
--     ab jetzt ueber dieselbe Funktion (lib/moderation.ts, proxy.ts).
--
--     Die Umstellung laeuft als Schleife ueber pg_policies statt als 20
--     ausgeschriebene alter policy: 0139 hat genau diese Policies gestern
--     umbenannt und zusammengelegt, und eine Liste mit festen Namen waere
--     beim naechsten Aufraeumen still veraltet. Die Schleife ersetzt nur den
--     exakten exists-Ausdruck und bricht die ganze Migration ab, wenn danach
--     noch irgendeine Policy is_moderator nennt — dann wird nichts entzogen
--     und nichts geht kaputt.
--
--     KUENFTIGE MIGRATIONEN: eine Policy darf profiles.is_moderator nicht mehr
--     direkt lesen. Sie scheitert sonst fuer jeden Aufrufer ohne Spaltenrecht
--     (anon UND authenticated) mit "permission denied". Immer
--     `(select public.ist_moderator())`.
--
-- (b) fahrt_start_ticket_gehort(p_ticket_id, p_user_id) ist fuer
--     authenticated ausfuehrbar und prueft gegen ein beliebiges p_user_id —
--     jedes Konto kann damit fuer fremde Ticket-IDs und fremde Konten
--     abfragen, wem ein Ticket gehoert. Entziehen geht nicht: der einzige
--     Aufrufer, save_free_ride_with_segments, laeuft als SECURITY INVOKER,
--     also als authenticated. Die Funktion ignoriert p_user_id ab jetzt und
--     nimmt auth.uid() — genau das, was der einzige Aufrufer ohnehin
--     uebergibt. Die Signatur bleibt, damit der Aufrufer nicht angefasst
--     werden muss.
--
-- (c) route_completions: INSERT ist fuer authenticated (und anon) auf der
--     ganzen Tabelle vergeben. Die meisten Spalten schreibt die App selbst
--     aus dem Server Action (lib/actions/completions.ts) oder aus
--     save_free_ride_with_segments (SECURITY INVOKER, laeuft als
--     authenticated) — Track, Distanz, Oeffentlichkeit, importiert,
--     Hoehenmeter: dort laesst sich per Spalten-Grant nichts wegnehmen, ohne
--     die eigenen Einfuegepfade zu brechen; was davon ein direkter
--     PostgREST-Aufruf faelschen kann, faengt nur ein Trigger oder ein
--     Einfuegen ueber SECURITY DEFINER ab (siehe PR-Beschreibung, bewusst
--     nicht hier).
--
--     Vier Spalten schreibt aber kein Pfad der App:
--       created_at  — Default now(). Frei waehlbar liess sie eine Fahrt im
--                     Feed ganz oben kleben (Zukunftsdatum) und umging die
--                     5-Sekunden-Sperre aus enforce_completion_cooldown, die
--                     created_at > now() - 5 s zaehlt (Rueckdatum).
--       id          — Default gen_random_uuid().
--       foto_url    — Altspalte; Fotos liegen seit langem in
--                     completion_photos.
--       motorklasse — setzt der Trigger set_motorklasse ohnehin neu.
--     (motorklasse_gewertet ist generiert und ohnehin nicht schreibbar.)
--     Diese vier verliert authenticated. anon verliert INSERT ganz: die
--     Policy verlangt auth.uid() = user_id, ein anon-Insert kann nie
--     gelingen, und kein Pfad der App schreibt ohne Konto.
--
--     Bewiesen ueber die drei einzigen Einfuegestellen (grep nach
--     from("route_completions") + .insert, und pg_proc nach "insert into
--     public.route_completions"):
--       logTrackedCompletion  (lib/actions/completions.ts, art 'strecke')
--       importGpxRide         (lib/actions/completions.ts, importiert true)
--       logFreeRide -> save_free_ride_with_segments (Elternzeile + Abschnitte)
--     Keine davon nennt id, created_at, foto_url oder motorklasse. PostgREST
--     schreibt nur die Spalten, die im Objekt stehen; Defaults fuellen den
--     Rest, und RETURNING braucht SELECT, das unveraendert bleibt.
--
-- REIHENFOLGE: Code zuerst, dann diese Migration. Der Code fragt
-- ist_moderator() und faellt auf das Spaltenlesen zurueck, solange es die
-- Funktion noch nicht gibt. Umgekehrt (Migration vor dem Deploy) liest der
-- alte Code is_moderator ohne Recht, bekommt null und haelt jeden fuer
-- Nicht-Moderator: /moderation waere zu, und staging (proxy.ts) liesse
-- niemanden mehr hinein, bis der Code nachkommt. (b) und (c) sind vom Code
-- unabhaengig.
--
-- PRUEFEN danach:
--   select grantee from information_schema.column_privileges
--    where table_name = 'profiles' and column_name = 'is_moderator'
--      and privilege_type = 'SELECT';                       -- nur postgres/service_role
--   select count(*) from pg_policies
--    where qual ilike '%is_moderator%' or with_check ilike '%is_moderator%';  -- 0
--   select column_name from information_schema.column_privileges
--    where table_name = 'route_completions' and grantee = 'authenticated'
--      and privilege_type = 'INSERT' order by 1;           -- 29 Spalten, ohne die vier
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'route_completions' and grantee = 'anon';   -- kein INSERT
--   Als Moderator auf staging einloggen (proxy.ts laesst hinein), /moderation
--   oeffnen; abgemeldet app.strado.ch oeffnen (Karte laedt); eine freie Fahrt
--   mit erkanntem Abschnitt speichern.
--
-- ZURUECK:
--   grant select (is_moderator) on public.profiles to anon, authenticated;
--   -- die Policies zurueck auf den exists-Ausdruck: dieselbe Schleife mit
--   -- vertauschten Seiten, oder die Definitionen aus 0139
--   grant insert on public.route_completions to anon, authenticated;
--   create or replace function public.fahrt_start_ticket_gehort(...) mit
--   `t.user_id = p_user_id` statt auth.uid() (Rumpf unten, eine Zeile).
--   ist_moderator() kann stehen bleiben; der Code faellt ohne sie zurueck.

set lock_timeout = '5s';

-- --------------------------------------------------------------------------
-- (a) ist_moderator()
-- --------------------------------------------------------------------------
-- SECURITY DEFINER, weil der Aufrufer die Spalte ab unten nicht mehr lesen
-- darf. Die Funktion nimmt keine Eingabe und antwortet nur ueber das eigene
-- Konto (auth.uid()); ohne Sitzung ist das NULL und die Antwort false. Mehr
-- als das eigene Flag verraet sie also nicht — genau das, was die Policies
-- und die App brauchen.
create or replace function public.ist_moderator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.is_moderator from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.ist_moderator() is
  'true, wenn das aufrufende Konto Moderator ist (0134). Fuer anon immer false. Policies nutzen (select public.ist_moderator()) statt profiles.is_moderator zu lesen.';

-- anon braucht EXECUTE: elf der umgestellten Policies gelten fuer die Rolle
-- public und werden auch fuer anonyme Abfragen ausgewertet (routes!). Die
-- Antwort ist dort immer false.
revoke execute on function public.ist_moderator() from public;
grant execute on function public.ist_moderator() to anon, authenticated, service_role;

-- Die Policies umstellen. Ersetzt wird nur der exakte Ausdruck, den
-- pg_policies heute zeigt — in beiden Schreibweisen von auth.uid(), die live
-- vorkommen (mit und ohne "(select ... as uid)"). Alles andere an der Policy
-- (Rolle, Befehl, Name, der Rest des Ausdrucks) bleibt, weil alter policy
-- nur using/with check anfasst.
do $$
declare
  v_pol record;
  v_muster constant text :=
    '\(EXISTS \( SELECT 1\s+FROM profiles\s+WHERE \(\(profiles\.id = (\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))\) AND \(profiles\.is_moderator = true\)\)\)\)';
  v_ersatz constant text := '(select public.ist_moderator())';
  v_sql text;
  v_anzahl integer := 0;
  v_rest integer;
begin
  for v_pol in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where qual ilike '%is_moderator%' or with_check ilike '%is_moderator%'
  loop
    v_sql := format('alter policy %I on %I.%I', v_pol.policyname, v_pol.schemaname, v_pol.tablename);
    if v_pol.qual is not null then
      v_sql := v_sql || ' using (' || regexp_replace(v_pol.qual, v_muster, v_ersatz, 'g') || ')';
    end if;
    if v_pol.with_check is not null then
      v_sql := v_sql || ' with check (' || regexp_replace(v_pol.with_check, v_muster, v_ersatz, 'g') || ')';
    end if;
    execute v_sql;
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Faellt eine Policy durch das Muster (andere Schreibweise, neue Policy
  -- aus einer spaeteren Migration), liest sie is_moderator weiterhin direkt
  -- und wuerde nach dem revoke unten scheitern. Dann lieber die ganze
  -- Migration abbrechen.
  select count(*) into v_rest
    from pg_policies
   where qual ilike '%is_moderator%' or with_check ilike '%is_moderator%';
  if v_rest > 0 then
    raise exception '0134: % Policies lesen is_moderator noch direkt — abgebrochen, nichts geaendert', v_rest;
  end if;

  -- Sichten laufen als ihr Besitzer und wuerden nicht scheitern, aber eine
  -- security_invoker-Sicht mit is_moderator wuerde es. Heute nennt keine
  -- Sicht die Spalte (gemessen); festhalten, dass das so bleibt.
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
       and pg_get_viewdef(c.oid) ilike '%is_moderator%'
  ) then
    raise exception '0134: eine Sicht liest is_moderator — abgebrochen, nichts geaendert';
  end if;

  raise notice '0134: % Policies auf ist_moderator() umgestellt', v_anzahl;
end;
$$;

-- Erst jetzt, da keine Policy die Spalte mehr als Aufrufer liest.
revoke select (is_moderator) on public.profiles from anon, authenticated;

-- --------------------------------------------------------------------------
-- (b) fahrt_start_ticket_gehort
-- --------------------------------------------------------------------------
-- LIVE-Rumpf (2026-09-25) mit genau einer Aenderung: auth.uid() statt
-- p_user_id. Der Parameter bleibt stehen, damit save_free_ride_with_segments
-- (uebergibt auth.uid()) unveraendert weiterlaeuft. SECURITY DEFINER aendert
-- auth.uid() nicht — die Funktion liest dieselbe Sitzung wie ihr Aufrufer.
create or replace function public.fahrt_start_ticket_gehort(p_ticket_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Prüft, ob das Ticket dem aufrufenden Konto gehört (oder ein Gastticket
  -- ist). p_user_id wird seit 0134 ignoriert: vorher liess sich damit fuer
  -- jedes fremde Konto abfragen, ob ihm ein Ticket gehoert.
  return exists (
    select 1 from public.fahrt_starts t
    where t.id = p_ticket_id
      and (t.user_id is null or t.user_id = auth.uid())
  );
end;
$$;

-- Grants wie live: authenticated (fuer save_free_ride_with_segments) und
-- service_role. anon hatte nichts und bekommt nichts.
revoke execute on function public.fahrt_start_ticket_gehort(uuid, uuid) from public, anon;
grant execute on function public.fahrt_start_ticket_gehort(uuid, uuid) to authenticated, service_role;

-- --------------------------------------------------------------------------
-- (c) route_completions: Insert-Spalten
-- --------------------------------------------------------------------------
-- Ein Tabellen-Grant laesst sich nicht spaltenweise verkleinern; also ganz
-- entziehen und die Spalten einzeln wieder vergeben. SELECT, UPDATE
-- (ist_oeffentlich, notiz, track_oeffentlich) und DELETE bleiben unberuehrt.
revoke insert on public.route_completions from anon, authenticated;

grant insert (
  user_id, route_id, fahrzeug_id, datum,
  distanz_km, dauer_sekunden, dauer_trail_sekunden, bewegte_zeit_sekunden,
  dauer_quelle, fahrt_start_id,
  art, ist_oeffentlich, abdeckung_prozent,
  notiz, titel, start_ort, region,
  hoehenmeter_aufstieg, hoehenprofil, hoehen_quelle, tempoprofil,
  track, track_oeffentlich,
  motorklasse_belegt,
  parent_completion_id, erkennung_automatisch,
  segment_fenster_von, segment_fenster_bis,
  importiert,
  -- fuer_follower kam mit 0145 (anderer Zweig, vor dem Einspielen dieser
  -- Datei live) dazu. save_free_ride_with_segments läuft als Aufrufer
  -- (SECURITY INVOKER) und schreibt die Spalte — ohne sie hier scheiterte
  -- das Speichern jeder freien Fahrt. Nachgetragen am 2026-09-25, vor dem
  -- Einspielen.
  fuer_follower
) on public.route_completions to authenticated;
