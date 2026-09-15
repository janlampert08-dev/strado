-- =====================================================================
-- Creator-Konten: ein Code gehört einem Nutzer, und dieser Nutzer sieht
-- seine eigenen Zahlen.
--
-- Bis hierher war ein Creator-Link eine Sache der Moderation: angelegt
-- unter /moderation/creator, ausgewertet per SQL. Diese Migration macht
-- aus dem Creator einen Beteiligten — die Moderation weist einen Code
-- einem Konto zu, und dieses Konto bekommt unter /creator drei Zahlen zu
-- sehen: Klicks, Registrierungen, Abos.
--
-- ---------------------------------------------------------------------
-- Es gibt keine Creator-Rolle als Spalte
-- ---------------------------------------------------------------------
-- Naheliegend wäre profiles.ist_creator gewesen. Dagegen sprechen zwei
-- Dinge. Erstens trägt profiles seit 0001 die Policy "Profile sind
-- öffentlich lesbar" mit using (true) — jede neue Spalte dort ist für
-- anon über PostgREST abrufbar, und wer für Strado wirbt, wäre damit
-- öffentlich auslesbar. Zweitens wäre es ein zweiter Ort für dieselbe
-- Wahrheit: Creator ist, wem ein Code gehört. Ein Flag daneben kann
-- davon abweichen, die Zuweisung selbst nicht.
--
-- Creator sein heisst deshalb genau: es existiert eine Zeile in
-- creator_links mit creator_user_id = auth.uid().
-- =====================================================================

alter table public.creator_links
  add column creator_user_id uuid references auth.users (id) on delete set null;

comment on column public.creator_links.creator_user_id is
  'Das Konto, dem dieser Code gehoert — vergeben von der Moderation. Zugleich die Creator-Rolle: wer hier steht, sieht /creator. Nullable, weil ein Code auch ohne zugewiesenes Konto laufen darf (Plakat, Newsletter, eine Person ohne Konto). Bei der Kontoloeschung genullt (0092).';

-- Teilindex: die Zuweisung ist die Ausnahme, nicht die Regel, und gesucht
-- wird immer nach einem gesetzten Wert.
create index creator_links_creator_user_id
  on public.creator_links (creator_user_id)
  where creator_user_id is not null;

-- ---------------------------------------------------------------------
-- Der Creator darf seine eigene Zeile LESEN — mehr nicht
--
-- 0084 gab die Tabelle allein der Moderation, und der Kommentar dort
-- nennt den Grund: name ist personenbezogen, und Spaltenrechte vergibt
-- Postgres pro Rolle, nicht pro Zeile. Eine SELECT-Policy auf die eigene
-- Zeile umgeht dieses Problem statt es zu verschärfen — sie zeigt
-- niemandem einen fremden Namen, sondern jedem seinen eigenen.
--
-- Ausdrücklich nur "for select": Ein Creator darf sich nicht selbst
-- aktiv schalten, den Code nicht umbenennen und ihn erst recht nicht
-- jemand anderem zuweisen. Das bleibt die "for all"-Policy der
-- Moderation aus 0084.
-- ---------------------------------------------------------------------
create policy "Creator sehen ihre eigenen Links"
  on public.creator_links for select to authenticated
  using (creator_user_id = (select auth.uid()));

comment on policy "Creator sehen ihre eigenen Links" on public.creator_links is
  'Leserecht auf die eigene Zeile, damit /creator weiss, welche Codes einem gehoeren. Kein Schreibrecht — Anlegen, Umschalten und Zuweisen bleiben bei der Moderation (0091).';

-- =====================================================================
-- creator_klicks — der Nenner
--
-- Ohne diese Tabelle lautet der Trichter "? Klicks → 12 Registrierungen".
-- Vercel Web Analytics kennt die Klicks, lässt sich aber nicht auf
-- auth.users joinen und zählt ausserdem nur Production. Ein Tagesaggregat
-- ohne jeden Personenbezug schliesst die Lücke: keine IP, keine Kennung,
-- keine Uhrzeit — eine Zahl pro Code und Tag.
--
-- on delete cascade, anders als bei registrierung_herkunft und
-- creator_konversionen (0088), die das Löschen eines Codes absichtlich
-- blockieren: ein Klickzähler ist kein Zuordnungsbeleg. Ein Code ohne
-- Registrierungen bleibt damit löschbar, und sein Zähler geht mit.
-- =====================================================================
create table public.creator_klicks (
  code text not null references public.creator_links (code) on delete cascade,
  tag date not null,
  klicks integer not null default 0,
  primary key (code, tag)
);

comment on table public.creator_klicks is
  'Klicks pro Creator-Code und Tag, ohne Personenbezug. Geschrieben ausschliesslich ueber creator_klick_zaehlen(). ACHTUNG: die Zahl ist indikativ, nicht belastbar — siehe den Kommentar an der Funktion (0091).';

alter table public.creator_klicks enable row level security;

revoke all on public.creator_klicks from anon, authenticated;

-- ---------------------------------------------------------------------
-- creator_klick_zaehlen — hochzählen, ohne die Tabelle zu öffnen
--
-- SECURITY DEFINER, und AGENTS.md verlangt die Begründung: der Aufrufer
-- ist app/c/[code]/route.ts, und der läuft je nach Besucher als anon ODER
-- als authenticated — ein Klick kommt meistens von jemandem ohne Konto.
-- Beiden Rollen ein INSERT/UPDATE auf creator_klicks zu geben, hiesse,
-- ihnen auch das Lesen und beliebiges Schreiben zu eröffnen. Diese
-- Funktion kann genau eines: den Zähler eines AKTIVEN, vergebenen Codes
-- um eins erhöhen. Sie gibt nichts zurück, sie legt keine Zeile für einen
-- erfundenen Code an, und sie kann nicht auflisten.
--
-- WAS SIE NICHT KANN, und das gehört gesagt: verhindern, dass jemand sie
-- oft aufruft. app/c/[code]/route.ts bremst pro IP (lib/rateLimit.ts),
-- aber ein direkter POST /rest/v1/rpc/creator_klick_zaehlen mit dem
-- öffentlichen Schlüssel geht an diesem Handler vorbei, und die Codes
-- stehen in TikTok-Captions. Die Klickzahl ist damit eine Anzeige, keine
-- Messung: als Vergütungsgrundlage ist sie untauglich.
--
-- Das ist kein Versehen, sondern die Eigenschaft jedes Klickzählers ohne
-- Anmeldung; wer es dichter will, braucht ein Signal, das der Browser
-- nicht selbst erzeugen kann. Belastbar sind die beiden anderen Zahlen:
-- eine Registrierung geht durch signUp(), ein Abo durch Stripe.
-- ---------------------------------------------------------------------
create function public.creator_klick_zaehlen(p_code text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.creator_klicks as k (code, tag, klicks)
  select l.code, current_date, 1
  from public.creator_links l
  where l.code = p_code and l.aktiv
  on conflict (code, tag) do update set klicks = k.klicks + 1;
$$;

comment on function public.creator_klick_zaehlen(text) is
  'Erhoeht den Tageszaehler eines aktiven Creator-Codes um eins. SECURITY DEFINER, weil der Aufrufer (app/c/[code]/route.ts) je nach Besucher anon oder authenticated ist und creator_klicks keiner der beiden Rollen geoeffnet werden soll. Die Zahl ist indikativ: der direkte RPC-Aufruf umgeht das IP-Limit des Handlers (0091).';

revoke execute on function public.creator_klick_zaehlen(text) from public;
grant execute on function public.creator_klick_zaehlen(text) to anon, authenticated;

-- =====================================================================
-- creator_kennzahlen — was das Dashboard zeigt
--
-- Warum eine Funktion und keine Policy auf creator_konversionen: Diese
-- Tabelle trägt user_id. Ein Creator darf erfahren, DASS zwölf Leute über
-- ihn kamen, niemals WER. Eine zeilenweise Freigabe — egal wie eng —
-- beantwortet zwangsläufig die zweite Frage mit. Aggregiert wird deshalb
-- in der Datenbank, und herausgereicht wird nur die Zahl.
--
-- Das ist dieselbe Begründung wie bei creator_link_aufloesen() in 0084:
-- die nötige Trennung verläuft nicht zwischen Zeilen, sondern zwischen
-- dem, was eine Zeile ist, und dem, was man aus vielen Zeilen ablesen
-- darf.
--
-- Wer welche Codes sieht, ist exakt dieselbe Regel wie in den Policies
-- auf creator_links: die eigenen, und als Moderator alle. Eine Regel,
-- zwei Orte — bewusst, weil die Funktion RLS umgeht und die Frage
-- deshalb selbst beantworten muss.
-- =====================================================================
create function public.creator_kennzahlen()
returns table (
  code text,
  name text,
  kanal text,
  kampagne text,
  aktiv boolean,
  klicks bigint,
  registrierungen bigint,
  abos bigint,
  abos_beendet bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    l.code,
    l.name,
    l.kanal,
    l.kampagne,
    l.aktiv,
    coalesce((select sum(k.klicks) from public.creator_klicks k where k.code = l.code), 0)::bigint,
    (select count(*) from public.creator_konversionen v
      where v.code = l.code and v.art = 'registrierung'),
    (select count(*) from public.creator_konversionen v
      where v.code = l.code and v.art = 'abo_start'),
    (select count(*) from public.creator_konversionen v
      where v.code = l.code and v.art = 'abo_ende')
  from public.creator_links l
  where
    l.creator_user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_moderator = true
    )
  order by l.erstellt_am desc;
$$;

comment on function public.creator_kennzahlen() is
  'Kennzahlen je Creator-Code fuer den Aufrufer: eigene Codes, als Moderator alle. SECURITY DEFINER, weil creator_konversionen user_id traegt — ein Creator darf erfahren, DASS jemand ueber ihn kam, nicht WER. Gibt ausschliesslich Summen zurueck, nie eine Zeile (0091).';

-- Ohne Anmeldung gibt es keine eigenen Codes — auth.uid() wäre NULL und
-- die WHERE-Bedingung damit für jede Zeile falsch. Der Grant an anon
-- bliebe also folgenlos, wird aber trotzdem nicht erteilt: eine Funktion,
-- die niemand ohne Konto sinnvoll aufrufen kann, soll auch niemand ohne
-- Konto aufrufen dürfen.
revoke execute on function public.creator_kennzahlen() from public;
grant execute on function public.creator_kennzahlen() to authenticated;

-- =====================================================================
-- creator_verlauf — dieselben Zahlen über die Zeit
--
-- Drei Gesamtzahlen sagen nicht, ob gerade etwas passiert. Der Verlauf
-- pro Tag beantwortet die Frage, für die ein Creator überhaupt
-- hereinschaut: hat das Video von gestern etwas gebracht?
--
-- Tagesgrenzen richten sich nach der Zeitzone der Datenbank (UTC) —
-- dieselbe, in der creator_klicks.tag über current_date entsteht. Beide
-- Reihen sind damit konsistent zueinander, auch wenn ein Schweizer Abend
-- rechnerisch in den Folgetag ragt.
-- =====================================================================
create function public.creator_verlauf(p_tage integer default 30)
returns table (
  code text,
  tag date,
  klicks integer,
  registrierungen bigint,
  abos bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with grenzen as (
    -- Eingabe des Aufrufers, hart begrenzt: ohne das erzeugte p_tage =
    -- 100000 eine Reihe von hunderttausend Zeilen pro Code.
    select greatest(least(coalesce(p_tage, 30), 90), 1) as tage
  ),
  erlaubt as (
    select l.code
    from public.creator_links l
    where
      l.creator_user_id = (select auth.uid())
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.is_moderator = true
      )
  ),
  tage as (
    select generate_series(
      current_date - ((select tage from grenzen) - 1),
      current_date,
      interval '1 day'
    )::date as tag
  )
  select
    e.code,
    t.tag,
    coalesce(k.klicks, 0),
    (select count(*) from public.creator_konversionen v
      where v.code = e.code and v.art = 'registrierung' and v.ereignis_am::date = t.tag),
    (select count(*) from public.creator_konversionen v
      where v.code = e.code and v.art = 'abo_start' and v.ereignis_am::date = t.tag)
  from erlaubt e
  cross join tage t
  left join public.creator_klicks k on k.code = e.code and k.tag = t.tag
  order by e.code, t.tag;
$$;

comment on function public.creator_verlauf(integer) is
  'Tagesverlauf je Creator-Code fuer den Aufrufer, hoechstens 90 Tage. Sichtbarkeit wie creator_kennzahlen(); gibt ebenfalls nur Summen zurueck (0091).';

revoke execute on function public.creator_verlauf(integer) from public;
grant execute on function public.creator_verlauf(integer) to authenticated;
