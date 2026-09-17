-- =====================================================================
-- Passstatus (für alle) und Pass-Alarm (Premium).
--
-- "Ist der Klausen schon offen?" ist von Oktober bis Juni die
-- meistgestellte Frage unter Schweizer Töfffahrern
-- (docs/markt/schweizer-identitaet.md §2.1). Diese Migration baut die
-- Skizze von dort: ein Status je Passstrecke, gepflegt über die
-- bestehende Moderation, keine neue Datenquelle und kein Vertrag.
--
-- Drei Tabellen, drei Zuständigkeiten:
--
--   A) pass_status           — der aktuelle Zustand je Passstrecke.
--                              Öffentlich lesbar, nur Moderatoren schreiben.
--   B) pass_alarme           — wer bei der Öffnung Bescheid will.
--                              Anlegen nur mit Premium, löschen immer.
--   C) pass_alarm_meldungen  — das dauerhafte Ereignis "dieser Pass ist
--                              für dich offen", geschrieben vom Trigger
--                              auf A, gelesen über die Aktivität.
--
-- Der Status ist bewusst NICHT Premium. Sicherheitsrelevante Information
-- gehört nicht hinter die Paywall (docs/premium-naechste-features.md, "Was
-- nicht hinter die Paywall gehört") — verkauft wird allein, dass Strado von
-- sich aus Bescheid gibt.
--
-- ---------------------------------------------------------------------
-- Warum KEINE Verlaufstabelle für den Status
-- ---------------------------------------------------------------------
-- Eine Zeile je Pass, überschrieben bei jeder Prüfung. Einen Verlauf
-- ("seit wann gesperrt, wie oft umgestellt") liest heute niemand, und das
-- eine Ereignis, das tatsächlich gebraucht wird — die Öffnung — steht
-- ohnehin dauerhaft in C. Wer später eine Saisonstatistik will, legt die
-- Verlaufstabelle dann an; nachträglich ist das ein Trigger mehr, kein
-- Umbau.
--
-- Jede Schreiboperation IST eine Prüfung: geprueft_am setzt der Trigger
-- in A auf now(), nicht der Client. Ein falsch als "offen" markierter Pass
-- ist schlimmer als gar keine Angabe (§2.1), deshalb darf das
-- Prüfdatum weder fehlen noch vom Formular behauptet werden.
--
-- ---------------------------------------------------------------------
-- Rechte — die Grant-Falle ausgeschrieben
-- ---------------------------------------------------------------------
-- Supabase vergibt jeder neuen Tabelle und Funktion in public direkte
-- Rechte an anon und authenticated, die ein `revoke ... from public` nicht
-- anfasst (0047, 0048, 0091, 0097 — AGENTS.md "Current State"). Jede
-- Tabelle hier beginnt deshalb mit `revoke all ... from anon,
-- authenticated`, jede Funktion mit `revoke execute ... from public, anon,
-- authenticated`, und erst danach wird genau das gewährt, was gebraucht
-- wird.
--
-- ---------------------------------------------------------------------
-- Ersetzte Funktionen — worauf die Rümpfe beruhen
-- ---------------------------------------------------------------------
-- count_unseen_activity() und mark_activity_seen() werden per
-- `create or replace` erweitert. Die letzte (und einzige) Migration, die
-- sie definiert, ist 0100_folge_benachrichtigungen.sql; kein offener
-- Zweig (geprüft 2026-09-17 über alle lokalen Worktrees und origin/*)
-- fasst sie an. Die Rümpfe unten sind die von 0100, wortgleich, plus je
-- ein Zusatz. VOR dem Einspielen den Live-Rumpf auslesen und vergleichen
-- (Abfrage in supabase/migrations/README.md) — die Lehre aus 0088/0090.
--
-- anonymize_account() wird bewusst NICHT ersetzt, siehe D).
--
-- ---------------------------------------------------------------------
-- Rückweg
-- ---------------------------------------------------------------------
-- Die Migration löscht nichts Bestehendes. Zurück:
--   1. count_unseen_activity() und mark_activity_seen() mit den Rümpfen
--      aus 0100 neu anlegen (create or replace, Grants bleiben).
--   2. drop function public.recent_pass_meldungen();
--   3. drop trigger profiles_pass_alarme_kontoloeschung on public.profiles;
--      drop function public.pass_alarme_kontoloeschung();
--   4. drop table public.pass_alarm_meldungen, public.pass_alarme,
--      public.pass_status cascade;  (nimmt Trigger und deren Funktionen
--      mit; die Funktionen danach einzeln droppen)
--   5. alter table public.profiles drop column pass_meldungen_gesehen_am;
-- Datenverlust dabei: Passstatus, gesetzte Alarme und Meldungen.
-- =====================================================================


-- =====================================================================
-- A) pass_status
-- =====================================================================
create table public.pass_status (
  route_id uuid primary key references public.routes(id) on delete cascade,
  status text not null
    constraint pass_status_wert check (status in ('offen', 'gesperrt', 'wintersperre')),
  -- Nur für einen geschlossenen Pass sinnvoll. Ein Datum, das an einem
  -- offenen Pass stehen bliebe, läse sich wie eine zweite, widersprechende
  -- Angabe — deshalb in der Datenbank ausgeschlossen, nicht nur im Formular.
  voraussichtlich_offen_ab date,
  hinweis text
    constraint pass_status_hinweis_laenge check (char_length(hinweis) between 1 and 200),
  quelle text
    constraint pass_status_quelle_laenge check (char_length(quelle) between 1 and 60),
  geprueft_am timestamptz not null default now(),
  -- Wer zuletzt geprüft hat. Nicht lesbar für anon/authenticated (kein
  -- Spalten-Grant, siehe unten): eine Moderatoren-Kennung hat auf einer
  -- öffentlichen Streckenseite nichts verloren. Für Rückfragen in SQL.
  aktualisiert_von uuid references public.profiles(id) on delete set null,
  constraint pass_status_datum_nur_geschlossen
    check (status <> 'offen' or voraussichtlich_offen_ab is null)
);

comment on table public.pass_status is
  'Aktueller Passstatus je Passstrecke (0112). Eine Zeile je Strecke, bei jeder Pruefung ueberschrieben; geprueft_am und aktualisiert_von setzt der Trigger pass_status_stempeln, nicht der Client. Lesbar fuer alle, soweit die Strecke freigegeben und nicht privat ist; schreibbar nur fuer Moderatoren und nur fuer Strecken der Kategorie passstrasse.';

alter table public.pass_status enable row level security;

revoke all on table public.pass_status from anon, authenticated;
-- Lesen: alles ausser aktualisiert_von.
grant select (route_id, status, voraussichtlich_offen_ab, hinweis, quelle, geprueft_am)
  on public.pass_status to anon, authenticated;
-- Schreiben: nur die Inhaltsspalten. geprueft_am/aktualisiert_von kommen
-- aus dem Trigger; route_id ist beim Update nicht änderbar, ein Status
-- wandert nicht von einem Pass zum anderen. Kein DELETE: ein Status wird
-- korrigiert, nicht entfernt — und verschwindet mit der Strecke (cascade).
grant insert (route_id, status, voraussichtlich_offen_ab, hinweis, quelle)
  on public.pass_status to authenticated;
grant update (status, voraussichtlich_offen_ab, hinweis, quelle)
  on public.pass_status to authenticated;

-- Sichtbarkeit wie die Strecke selbst ("Freigegebene Strecken sind
-- öffentlich lesbar", 0049) — aber ausdrücklich nur der öffentliche Zweig.
-- Die Unterabfrage läuft zusätzlich unter der RLS von routes; die
-- ausgeschriebene Bedingung macht die Grenze trotzdem hier lesbar, statt
-- sie aus einer fremden Policy zu erben: eine private Strecke hat keinen
-- Status, der irgendjemandem gezeigt würde, auch nicht der Besitzerin.
create policy "Passstatus oeffentlicher Strecken ist lesbar"
  on public.pass_status for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.routes r
      where r.id = pass_status.route_id
        and r.status_ok = true
        and r.ist_privat = false
    )
  );

create policy "Moderatoren setzen Passstatus"
  on public.pass_status for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_moderator = true
    )
    and exists (
      select 1 from public.routes r
      where r.id = pass_status.route_id
        and r.status_ok = true
        and r.ist_privat = false
        and 'passstrasse' = any (r.kategorien)
    )
  );

create policy "Moderatoren aendern Passstatus"
  on public.pass_status for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_moderator = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_moderator = true
    )
    and exists (
      select 1 from public.routes r
      where r.id = pass_status.route_id
        and r.status_ok = true
        and r.ist_privat = false
        and 'passstrasse' = any (r.kategorien)
    )
  );

-- Prüfstempel. SECURITY INVOKER: setzt nur Werte in der Zeile, die der
-- Aufrufer ohnehin schreiben darf. Feuert nur auf die Inhaltsspalten —
-- damit das Nullen von aktualisiert_von bei einer Kontolöschung (D) nicht
-- selbst als "geprüft" zählt und geprueft_am verfälscht.
create function public.pass_status_stempeln()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.geprueft_am := now();
  new.aktualisiert_von := auth.uid();
  return new;
end;
$$;

revoke execute on function public.pass_status_stempeln() from public, anon, authenticated;

create trigger pass_status_stempeln
  before insert or update of status, voraussichtlich_offen_ab, hinweis, quelle
  on public.pass_status
  for each row execute function public.pass_status_stempeln();


-- =====================================================================
-- B) pass_alarme
-- =====================================================================
create table public.pass_alarme (
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  primary key (user_id, route_id)
);

comment on table public.pass_alarme is
  'Pass-Alarm (0112, Premium): dieses Konto will eine Meldung, sobald die Passstrecke auf offen gesetzt wird. Anlegen verlangt profiles.ist_premium (RLS); loeschen darf man den eigenen Alarm immer, auch nach Ablauf des Abos. Ohne Obergrenze — die Zahl ist durch die Passstrecken selbst begrenzt.';

-- Für den Trigger in C: alle Alarme eines Passes.
create index pass_alarme_route_id_idx on public.pass_alarme (route_id);

alter table public.pass_alarme enable row level security;

revoke all on table public.pass_alarme from anon, authenticated;
grant select, delete on public.pass_alarme to authenticated;
grant insert (user_id, route_id) on public.pass_alarme to authenticated;

create policy "Nutzer sehen eigene Pass-Alarme"
  on public.pass_alarme for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Premium in der Policy, nicht nur in der Server Action: sonst legte ein
-- direkter PostgREST-Aufruf den Alarm ohne Abo an. Dasselbe Muster wie die
-- Strecken-Policy aus 0077. ist_premium trägt seit 0034 einen
-- Spalten-Grant an authenticated, die Unterabfrage darf ihn also lesen.
create policy "Premium-Nutzer setzen Pass-Alarme"
  on public.pass_alarme for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.ist_premium = true
    )
    and exists (
      select 1 from public.routes r
      where r.id = pass_alarme.route_id
        and r.status_ok = true
        and r.ist_privat = false
        and 'passstrasse' = any (r.kategorien)
    )
  );

-- Ohne Premium-Bedingung: wer sein Abo beendet, soll seine Alarme trotzdem
-- loswerden können. Additives Gating (docs/premium-plan.md §4) — Premium
-- legt etwas obendrauf, es hält nichts fest.
create policy "Nutzer loeschen eigene Pass-Alarme"
  on public.pass_alarme for delete
  to authenticated
  using (user_id = (select auth.uid()));


-- =====================================================================
-- C) pass_alarm_meldungen und der Öffnungs-Trigger
-- =====================================================================
-- Ein append-only Ereignis statt einer Ableitung wie bei Followern (0100):
-- dort IST die follows-Zeile das Ereignis, hier ist das Ereignis ein
-- Übergang (x -> offen), der in pass_status beim nächsten Überschreiben
-- verschwindet. Ohne eigene Zeile gäbe es nach "offen -> gesperrt" keine
-- Spur mehr davon, dass jemand benachrichtigt wurde.
create table public.pass_alarm_meldungen (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  erstellt_am timestamptz not null default now()
);

comment on table public.pass_alarm_meldungen is
  'Pass geoeffnet, je Abonnent eine Zeile (0112). Geschrieben ausschliesslich vom Trigger pass_status_oeffnung_melden, gelesen ausschliesslich ueber recent_pass_meldungen()/count_unseen_activity(). RLS an, keine Policy, keine Grants.';

create index pass_alarm_meldungen_user_idx
  on public.pass_alarm_meldungen (user_id, erstellt_am desc);

alter table public.pass_alarm_meldungen enable row level security;
revoke all on table public.pass_alarm_meldungen from anon, authenticated;

-- SECURITY DEFINER, und warum das hier nicht zu umgehen ist: geschrieben
-- wird im Namen eines Moderators, der fremde Alarme weder lesen noch für
-- andere Konten Meldungen anlegen darf — und auch nicht dürfen soll. Die
-- Funktion nimmt keine Eingabe ausser der gerade geschriebenen Zeile, deren
-- Schreibrecht RLS auf pass_status bereits geprüft hat.
--
-- Nur Übergänge nach "offen" melden, nicht jede Prüfung: ein Moderator,
-- der einen offenen Pass erneut als offen bestätigt, erzeugt nichts. Ein
-- INSERT mit "offen" meldet dagegen — auch ein erstmals erfasster Pass kann
-- abonniert gewesen sein.
--
-- Nur Abonnenten, die JETZT Premium sind: der Alarm ist die bezahlte
-- Leistung, nicht die Zeile in pass_alarme. Wer das Abo auslaufen lässt,
-- behält seine Alarme (sie ruhen) und bekommt nach einem erneuten Abschluss
-- wieder Meldungen, ohne alles neu setzen zu müssen. Gelöschte Konten sind
-- über ist_premium = false (anonymize_account) ohnehin ausgeschlossen; die
-- geloescht_am-Bedingung hält das auch dann, wenn jemand Premium von Hand
-- setzt.
create function public.pass_status_oeffnung_melden()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'offen' then
    return null;
  end if;
  -- Verschachtelt statt `tg_op = 'UPDATE' and old.status = ...`: plpgsql
  -- sichert für `and` keine Auswertungsreihenfolge zu, und bei einem
  -- INSERT gibt es kein OLD.
  if tg_op = 'UPDATE' then
    if old.status = 'offen' then
      return null;
    end if;
  end if;

  insert into public.pass_alarm_meldungen (user_id, route_id)
  select a.user_id, new.route_id
  from public.pass_alarme a
  join public.profiles p on p.id = a.user_id
  where a.route_id = new.route_id
    and p.ist_premium = true
    and p.geloescht_am is null;

  return null;
end;
$$;

revoke execute on function public.pass_status_oeffnung_melden() from public, anon, authenticated;

-- AFTER: die Meldung entsteht in derselben Transaktion wie der Status. Schlägt
-- das Einfügen fehl, bleibt auch der Status ungeändert — lieber ein
-- sichtbarer Fehler in der Moderation als ein offener Pass ohne Meldung.
create trigger pass_status_oeffnung_melden
  after insert or update of status
  on public.pass_status
  for each row execute function public.pass_status_oeffnung_melden();


-- =====================================================================
-- D) Kontolöschung
-- =====================================================================
-- Die Fremdschlüssel oben tragen `on delete cascade`, aber sie feuern nie:
-- deleteAccount() (lib/actions/auth.ts) löscht weder auth.users noch
-- profiles, sondern anonymisiert über anonymize_account() (zuletzt 0092)
-- und setzt dabei profiles.geloescht_am. Genau das schreiben 0090 und 0092
-- in ihre Köpfe.
--
-- Warum ein Trigger auf geloescht_am statt einer weiteren Anweisung in
-- anonymize_account(): Die Funktion hat gerade einen konkurrierenden
-- Ersatz auf einem offenen Zweig (0101_anonymisierung_fahrtstarts, PR
-- #255), und jeder `create or replace` darauf ist reihenfolgeabhängig —
-- wer zuletzt einspielt, dreht den anderen still zurück. Ein Trigger hängt
-- an keinem Funktionsrumpf und übersteht jede künftige Fassung der
-- Funktion, solange sie geloescht_am setzt (das ist ihr einziges
-- Kennzeichen eines gelöschten Kontos, 0058).
--
-- `update of geloescht_am` feuert, sobald die Spalte in der SET-Liste
-- steht, auch wenn coalesce() den alten Wert behält — ein zweiter Lauf von
-- anonymize_account räumt also erneut auf (idempotent, wie die Funktion).
-- authenticated hat keinen Update-Grant auf geloescht_am (0034/0058),
-- auslösen kann das nur service_role bzw. die DEFINER-Funktion.
--
-- SECURITY INVOKER genügt: der einzige Auslöser läuft bereits mit
-- Eigentümerrechten.
create function public.pass_alarme_kontoloeschung()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.pass_alarme where user_id = new.id;
  delete from public.pass_alarm_meldungen where user_id = new.id;
  -- Die Kennung des Moderators am Passstatus. Der Status selbst bleibt —
  -- er ist eine Angabe über den Pass, nicht über die Person. Das Update
  -- berührt keine Inhaltsspalte, pass_status_stempeln feuert also nicht.
  update public.pass_status set aktualisiert_von = null where aktualisiert_von = new.id;
  return null;
end;
$$;

revoke execute on function public.pass_alarme_kontoloeschung() from public, anon, authenticated;

create trigger profiles_pass_alarme_kontoloeschung
  after update of geloescht_am on public.profiles
  for each row
  when (new.geloescht_am is not null)
  execute function public.pass_alarme_kontoloeschung();


-- =====================================================================
-- E) Aktivität: gesehen-Zeitpunkt, Liste, Zähler, Markieren
-- =====================================================================
-- Exakt das Muster von kudos_gesehen_am (0053) und follows_gesehen_am
-- (0100): default now(), damit niemand beim Einspielen Altes als neu
-- vorgesetzt bekommt (es gibt noch nichts Altes, aber die Regel gilt), und
-- bewusst KEIN Spalten-Grant — die SELECT-Policy auf profiles ist
-- zeilenoffen, ein Grant verriete fremde Besuchszeitpunkte.
alter table public.profiles
  add column pass_meldungen_gesehen_am timestamptz not null default now();

comment on column public.profiles.pass_meldungen_gesehen_am is
  'Zeitpunkt, zu dem der Nutzer zuletzt seine Pass-Alarm-Meldungen gesehen hat (0112). Kein Spalten-Grant an anon/authenticated, gleiche Begruendung wie follows_gesehen_am (0100). Nur ueber recent_pass_meldungen()/count_unseen_activity()/mark_activity_seen() gelesen bzw. geschrieben, alle auf auth.uid() beschraenkt.';

-- Die Liste, Gegenstück zu recent_follows_received (0100). SECURITY
-- DEFINER, weil pass_alarm_meldungen keine Grants trägt und
-- pass_meldungen_gesehen_am keinen Spalten-Grant. Keine Parameter, nur
-- auth.uid(), festes Limit.
--
-- Der Filter auf freigegebene, nicht private Strecken steht ausdrücklich
-- da, weil DEFINER die RLS von routes umgeht: sollte eine Strecke je aus
-- der Öffentlichkeit genommen werden, soll ihr Name nicht über eine alte
-- Meldung weiterleben.
create function public.recent_pass_meldungen()
returns table (
  meldung_id bigint,
  route_id uuid,
  route_name text,
  erstellt_am timestamptz,
  neu boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    m.id as meldung_id,
    m.route_id,
    r.name as route_name,
    m.erstellt_am,
    m.erstellt_am > (
      select pr.pass_meldungen_gesehen_am from public.profiles pr where pr.id = auth.uid()
    ) as neu
  from public.pass_alarm_meldungen m
  join public.routes r on r.id = m.route_id
  where m.user_id = auth.uid()
    and r.status_ok = true
    and r.ist_privat = false
  order by m.erstellt_am desc
  limit 30;
$$;

comment on function public.recent_pass_meldungen() is
  'Die letzten (max. 30) Pass-Alarm-Meldungen des eingeloggten Nutzers, inkl. "neu"-Flag relativ zu profiles.pass_meldungen_gesehen_am. Nur fuer auth.uid() selbst, nur freigegebene nicht-private Strecken. Gegenstueck zu recent_follows_received (0100).';

revoke execute on function public.recent_pass_meldungen() from public, anon, authenticated;
grant execute on function public.recent_pass_meldungen() to authenticated;

-- Rumpf von 0100, wortgleich, plus der dritte Summand. search_path bleibt
-- wie in 0100 — der Ersatz soll nur das ändern, was er ankündigt.
create or replace function public.count_unseen_activity()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select
    (
      select count(*)
      from public.kudos k
      join public.route_completions rc on rc.id = k.completion_id
      where rc.user_id = auth.uid()
        and k.erstellt_am > (
          select p.kudos_gesehen_am from public.profiles p where p.id = auth.uid()
        )
    )
    +
    (
      select count(*)
      from public.follows f
      where f.followed_id = auth.uid()
        and f.erstellt_am > (
          select p.follows_gesehen_am from public.profiles p where p.id = auth.uid()
        )
    )
    +
    -- Neu in 0112. Derselbe Streckenfilter wie in recent_pass_meldungen():
    -- das Abzeichen darf nichts zählen, was die Liste nicht zeigt, sonst
    -- bliebe es nach dem Besuch von /aktivitaet stehen.
    (
      select count(*)
      from public.pass_alarm_meldungen m
      join public.routes r on r.id = m.route_id
      where m.user_id = auth.uid()
        and r.status_ok = true
        and r.ist_privat = false
        and m.erstellt_am > (
          select p.pass_meldungen_gesehen_am from public.profiles p where p.id = auth.uid()
        )
    );
$$;

comment on function public.count_unseen_activity() is
  'Ungesehene Aktivitaet des eingeloggten Nutzers insgesamt: Kudos auf eigenen Fahrten (seit kudos_gesehen_am), neue Follower (seit follows_gesehen_am) und seit 0112 Pass-Alarm-Meldungen (seit pass_meldungen_gesehen_am). Nur fuer auth.uid() selbst. Speist das Abzeichen in der Kopfleiste; count_unseen_kudos (0053) bleibt fuer /profil bestehen.';

-- Zusicherung, keine Reparatur: create or replace behält die Rechte aus
-- 0100. Ausgeschrieben, damit ein Neuaufbau aus den Migrationen allein
-- dasselbe ergibt.
revoke execute on function public.count_unseen_activity() from public, anon;
grant execute on function public.count_unseen_activity() to authenticated;

-- Rumpf von 0100, wortgleich, plus der dritte Zeitpunkt. /aktivitaet zeigt
-- alle drei Arten nebeneinander, markiert also auch alle drei.
create or replace function public.mark_activity_seen()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set kudos_gesehen_am = now(),
      follows_gesehen_am = now(),
      pass_meldungen_gesehen_am = now()
  where id = auth.uid();
end;
$$;

comment on function public.mark_activity_seen() is
  'Markiert Kudos, neue Follower und seit 0112 Pass-Alarm-Meldungen als gesehen (setzt kudos_gesehen_am, follows_gesehen_am und pass_meldungen_gesehen_am auf now()). Nur fuer auth.uid() selbst. Aufgerufen von /aktivitaet; mark_kudos_seen (0053) bleibt fuer /profil bestehen.';

revoke execute on function public.mark_activity_seen() from public, anon;
grant execute on function public.mark_activity_seen() to authenticated;
