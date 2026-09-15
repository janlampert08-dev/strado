-- Der serverseitig aufgezeichnete Fahrtstart — das offene Bein von A1.
--
-- Bisher entstand dauer_sekunden zwar serverseitig (lib/actions/completions.ts
-- -> computeTrailStats), aber aus den Zeitstempeln des Trails, und die kommen
-- vom Client: ein echter Track mit x0.4 gestauchten Zeiten bleibt im
-- 200-km/h-Band aus 0059 und kommt durch. docs/audit/README.md nennt das
-- "A1 Bein 2" und schreibt dazu, was fehlt — "ein Fahrtstart, den der Server
-- selbst aufgezeichnet hat".
--
-- Genau das ist diese Tabelle. Beim tatsaechlichen Beginn der Zeitmessung
-- (useRideRecorder -> beginActualTracking; im Streckenmodus also beim
-- Erreichen des Startpunkts, nicht beim Tippen auf "Strecke starten") holt der
-- Client ein Ticket. Beim Speichern wird es eingeloest, und die Dauer ist die
-- Differenz zweier Serverzeiten. Wer eine Zeit faelschen will, muss sie
-- absitzen.
--
-- Warum eine Tabelle und kein signiertes Token: ein Token muesste gegen
-- Wiedereinloesung geschuetzt werden, und dafuer braucht es ohnehin Zustand.
-- Dann lieber gleich eine Zeile, die verbraucht_am traegt.
--
-- Warum user_id nullable ist: abgemeldete Besucher duerfen aufzeichnen
-- (GefahrenSection nimmt userId: string | null), beim Start gibt es also keine
-- Sitzung, an die der Start zu haengen waere. Stattdessen haelt der Client ein
-- Geheimnis, von dem hier nur der SHA-256-Abdruck liegt; einloesen kann nur,
-- wer es vorweist. Das ist der Punkt, an dem der Gastfluss sich aendert — die
-- Audit-Notiz sagt voraus, dass jede Loesung das tut.

create table if not exists public.fahrt_starts (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 des Geheimnisses als Hex. Nie das Geheimnis selbst: wer die Zeile
  -- lesen koennte, koennte sonst fremde Tickets einloesen.
  geheimnis_abdruck text not null,
  -- Null bei einer Gastaufzeichnung. Beim Einloesen wird nicht gegen user_id
  -- geprueft, sondern gegen das Geheimnis — ein Gast meldet sich zwischen
  -- Start und Speichern ja gerade erst an.
  user_id uuid references auth.users (id) on delete cascade,
  strecke_id uuid references public.routes (id) on delete set null,
  art text not null check (art in ('strecke', 'frei')),
  gestartet_am timestamptz not null default now(),
  verbraucht_am timestamptz,
  -- Beim Einloesen festgehalten, damit der Trigger unten sie abschreiben kann
  -- statt dem Client zu glauben.
  dauer_sekunden integer,
  eingeloest_von uuid references auth.users (id) on delete cascade
);

comment on table public.fahrt_starts is
  'Serverseitig aufgezeichneter Beginn einer Zeitmessung (A1 Bein 2). Nur ueber fahrt_start_anlegen/-einloesen erreichbar.';

-- Der Aufraeumlauf sucht alte, nie eingeloeste Tickets.
create index if not exists fahrt_starts_offen_idx
  on public.fahrt_starts (gestartet_am)
  where verbraucht_am is null;

-- RLS an, aber bewusst ohne jede Policy: an dieser Tabelle hat der Client
-- nichts direkt zu suchen. Beide Wege laufen ueber die zwei Funktionen unten.
alter table public.fahrt_starts enable row level security;

revoke all on table public.fahrt_starts from anon, authenticated;

-- --------------------------------------------------------------------------
-- Anlegen
-- --------------------------------------------------------------------------
-- SECURITY DEFINER, weil die Tabelle fuer niemanden direkt schreibbar ist und
-- ein Gast keine Sitzung hat, an der eine Policy ansetzen koennte. Die
-- Funktion entscheidet nichts anhand unbeglaubigter Eingaben: sie schreibt,
-- was ihr gegeben wird, und haengt auth.uid() an — bei einem Gast NULL.
create or replace function public.fahrt_start_anlegen(
  p_abdruck text,
  p_art text,
  p_strecke_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_abdruck is null or length(p_abdruck) <> 64 then
    raise exception 'Ungueltiger Abdruck';
  end if;
  if p_art not in ('strecke', 'frei') then
    raise exception 'Ungueltige Art';
  end if;

  insert into public.fahrt_starts (geheimnis_abdruck, user_id, strecke_id, art)
  values (p_abdruck, auth.uid(), p_strecke_id, p_art)
  returning id into v_id;

  return v_id;
end;
$$;

-- --------------------------------------------------------------------------
-- Einloesen
-- --------------------------------------------------------------------------
-- Gibt die verstrichenen Sekunden zurueck, oder NULL, wenn das Ticket nicht
-- passt, schon verbraucht oder aelter als ein Tag ist. NULL heisst fuer den
-- Aufrufer: keine serverseitige Zeit, also dauer_quelle = 'trail' und damit
-- keine Bestenliste (siehe route_leaderboard unten).
--
-- Die 24 Stunden sind kein Sicherheitsband, sondern die Obergrenze aus 0059
-- (dauer_sekunden <= 86400). Ein laenger offenes Ticket wuerde die Constraint
-- reissen, also faellt es hier sauber durch.
create or replace function public.fahrt_start_einloesen(
  p_id uuid,
  p_abdruck text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sekunden integer;
begin
  -- auth.uid() ist hier nie NULL: die Funktion ist nur an authenticated
  -- vergeben, und gespeichert wird eine Fahrt ohnehin erst mit Konto.
  update public.fahrt_starts
     set verbraucht_am = now(),
         dauer_sekunden = greatest(1, extract(epoch from (now() - gestartet_am))::integer),
         eingeloest_von = auth.uid()
   where id = p_id
     and geheimnis_abdruck = p_abdruck
     and verbraucht_am is null
     and gestartet_am > now() - interval '24 hours'
  returning dauer_sekunden into v_sekunden;

  return v_sekunden;
end;
$$;

revoke execute on function public.fahrt_start_anlegen(text, text, uuid) from public;
revoke execute on function public.fahrt_start_einloesen(uuid, text) from public;

-- Ausdruecklich beide Rollen benennen. Supabase legt fuer jede neue Funktion in
-- public eine direkte Ausfuehrungsberechtigung fuer anon und authenticated an;
-- ein revoke from PUBLIC fasst die nicht an. Dieselbe Falle wie in 0047, 0048
-- und 0091 — hier also positiv formuliert statt negativ.
grant execute on function public.fahrt_start_anlegen(text, text, uuid) to anon, authenticated;
-- Einloesen nur angemeldet: gespeichert wird eine Fahrt ohnehin erst mit Konto.
grant execute on function public.fahrt_start_einloesen(uuid, text) to authenticated;

-- --------------------------------------------------------------------------
-- route_completions: woher die Dauer stammt
-- --------------------------------------------------------------------------
alter table public.route_completions
  add column if not exists dauer_quelle text not null default 'trail'
    check (dauer_quelle in ('trail', 'server')),
  -- Die aus dem Trail gerechnete Dauer bleibt erhalten: sie ist das, was die
  -- Fahrerin auf dem Schirm gesehen hat, und sie ist fuer die eigene Statistik
  -- das ehrlichere Mass. Nur gewertet wird sie nicht.
  add column if not exists dauer_trail_sekunden integer,
  add column if not exists fahrt_start_id uuid references public.fahrt_starts (id) on delete set null;

comment on column public.route_completions.dauer_quelle is
  'server = dauer_sekunden stammt aus fahrt_starts (zwei Serverzeiten). trail = aus Client-Zeitstempeln, nicht wertbar.';

-- Ein Ticket gehoert zu genau einer Fahrt.
create unique index if not exists route_completions_fahrt_start_idx
  on public.route_completions (fahrt_start_id)
  where fahrt_start_id is not null;

-- Ein Trigger statt eines Entzugs — dieselbe Linie wie 0052/0059 und aus
-- demselben Grund: er greift auf JEDEM Schreibweg (Server Action, direkter
-- PostgREST-Insert, save_free_ride_with_segments), ohne dass irgendein
-- Aufrufer angepasst werden muesste. Ein revoke haette stattdessen den
-- eigenen Server Action mit ausgesperrt.
--
-- Was er erzwingt: dauer_quelle = 'server' gilt nur, wenn ein eingeloestes
-- Ticket daneben liegt, das derselben Person gehoert — und dann steht dort
-- auch die Dauer. Der Client kann also weder die Herkunft behaupten noch die
-- Zahl waehlen.
create or replace function public.enforce_route_completion_dauer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start public.fahrt_starts%rowtype;
begin
  if new.fahrt_start_id is null then
    new.dauer_quelle := 'trail';
    return new;
  end if;

  select * into v_start
    from public.fahrt_starts
   where id = new.fahrt_start_id;

  -- Unbekanntes, nicht eingeloestes oder fremdes Ticket: keine Ablehnung,
  -- sondern Herabstufung. Die Fahrt ist deshalb nicht falsch, sie ist nur
  -- nicht wertbar — und eine echte Fahrt wegzuwerfen waere der groessere
  -- Schaden. Ticket-IDs sind nicht geheim, deshalb die Pruefung auf
  -- eingeloest_von: sonst koennte sich jemand die Zeit eines anderen
  -- anhaengen.
  if v_start.id is null
     or v_start.verbraucht_am is null
     or v_start.dauer_sekunden is null
     or v_start.eingeloest_von is distinct from new.user_id then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    return new;
  end if;

  new.dauer_quelle := 'server';
  new.dauer_sekunden := v_start.dauer_sekunden;
  return new;
end;
$$;

revoke execute on function public.enforce_route_completion_dauer() from public, anon, authenticated;

-- Vor 0059s Statistik-Trigger, damit dessen Bandpruefung die endgueltige
-- Dauer sieht: Triggernamen gleicher Art laufen alphabetisch, und
-- "enforce_route_completion_dauer" kommt vor "enforce_route_completion_stats".
drop trigger if exists enforce_route_completion_dauer on public.route_completions;
create trigger enforce_route_completion_dauer
  before insert or update on public.route_completions
  for each row execute function public.enforce_route_completion_dauer();

-- --------------------------------------------------------------------------
-- Bestenliste: nur serverseitig gestoppte Fahrten
-- --------------------------------------------------------------------------
-- Der eigentliche Punkt der Uebung. Eine Zeit, die aus Client-Zeitstempeln
-- stammt, steht ab hier nicht mehr in der Rangliste — auch die bereits
-- erfassten nicht. Das ist Absicht und kostet heute fast nichts: die Liste
-- zeigt derzeit "Noch keine geteilten Zeiten fuer diese Strecke".
--
-- Spaltenliste unveraendert, deshalb genuegt create or replace (die Grants
-- bleiben damit erhalten).
create or replace view public.route_leaderboard as
select
  rc.id as completion_id,
  rc.route_id,
  rc.user_id,
  p.display_name,
  rc.dauer_sekunden,
  rc.distanz_km,
  rc.datum,
  (p.ist_premium and p.zeigt_premium_badge) as ist_premium,
  p.zeigt_premium_badge,
  case when p.zeigt_avatar then p.avatar_url else null end as avatar_url,
  rc.motorklasse_gewertet as motorklasse
from route_completions rc
  join profiles p on (p.id = rc.user_id)
  join routes r on (r.id = rc.route_id)
where r.status_ok = true
  and r.ist_privat = false
  and rc.ist_oeffentlich = true
  and rc.dauer_sekunden is not null
  and rc.dauer_quelle = 'server'
  and rc.art = 'strecke';
