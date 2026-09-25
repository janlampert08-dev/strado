-- =====================================================================
-- 0146 — Folgeanfragen
-- =====================================================================
--
-- Bis hier konnte jeder jedem folgen, ohne Bestätigung (0030). Seit 0145
-- gibt es Fahrten "nur für Follower" — und die schützt nichts, solange
-- jeder Follower werden kann, der will. Neu: profiles.folgen_bestaetigen.
-- Ist es an, wird aus "Folgen" eine Anfrage, die der Gefolgte annimmt oder
-- ablehnt.
--
-- ENTSCHEID DES EIGENTÜMERS (2026-09-25): eine Einstellung, für alle
-- voreingestellt AN — auch für bestehende Konten. Bestehende Follower
-- bleiben; die Einstellung wirkt nur auf neue.
--
-- Anfragen liegen in einer EIGENEN Tabelle, nicht als Status-Spalte in
-- follows. follows bedeutet damit weiter genau "folgt" — Zähler,
-- Follower-Listen, der "Folge ich"-Feed, recent_follows_received und die
-- Follower-Sichtbarkeit aus 0145 lesen alle follows und müssen nichts über
-- offene Anfragen wissen. Eine vergessene Stelle kann eine Anfrage so nicht
-- versehentlich wie ein Folgen behandeln. Angenommen wird über
-- folgeanfrage_annehmen(), die die Anfrage in eine follows-Zeile umsetzt.
--
-- ZWEI SCHRITTE, weil die Durchsetzung den alten Code bräche:
--   0146 (diese Datei) ist rein additiv. Der heutige Folgen-Knopf schreibt
--        weiter direkt in follows und funktioniert unverändert — er kennt
--        die Einstellung nur noch nicht.
--   0147 verbietet das direkte Folgen, wenn der Gefolgte bestätigen will.
--        Erst einspielen, wenn der Code, der Anfragen stellt, auf main
--        (Produktion) läuft — sonst folgt dort niemand mehr jemandem.
--
-- Anfragen erscheinen unter /aktivitaet (Wunsch des Eigentümers) und zählen
-- im Abzeichen der Kopfleiste mit, solange sie ungesehen sind.
--
-- PRÜFUNG DANACH:
--   select count(*) from public.profiles where not folgen_bestaetigen;   -- 0
--   select count(*) from public.folge_anfragen;                          -- 0
--   select has_table_privilege('anon', 'public.folge_anfragen', 'select'); -- false
--
-- WEG ZURÜCK: count_unseen_activity und anonymize_account aus 0145 bzw.
-- dem Katalogstand vom 2026-09-25 neu anlegen, dann die vier Funktionen,
-- die Tabelle und die Spalte löschen.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- A) Einstellung
-- ---------------------------------------------------------------------
-- default true ist eine Konstante: PostgreSQL legt den Wert einmal ab,
-- statt die Tabelle umzuschreiben — und jedes bestehende Profil steht
-- damit sofort auf "bestätigen".
alter table public.profiles
  add column folgen_bestaetigen boolean not null default true;

comment on column public.profiles.folgen_bestaetigen is
  'Neue Follower brauchen eine Bestätigung (0146). Voreingestellt an. Bestehende Follower bleiben beim Einschalten.';

-- Lesen dürfen angemeldete Nutzer: der Folgen-Knopf auf fremden Profilen
-- muss wissen, ob er "Folgen" oder "Anfrage senden" sagt. Verrät nicht
-- mehr als ein privates Konto auf jeder anderen Plattform.
grant select (folgen_bestaetigen), update (folgen_bestaetigen)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- B) Anfragen
-- ---------------------------------------------------------------------
create table public.folge_anfragen (
  von uuid not null references auth.users (id) on delete cascade,
  an uuid not null references auth.users (id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  primary key (von, an),
  constraint folge_anfragen_nicht_selbst check (von <> an)
);

create index folge_anfragen_an_idx on public.folge_anfragen (an, erstellt_am desc);

comment on table public.folge_anfragen is
  'Offene Folgeanfragen (0146). Angenommen wird über folgeanfrage_annehmen(), das daraus eine follows-Zeile macht; abgelehnt oder zurückgezogen durch Löschen.';

alter table public.folge_anfragen enable row level security;

-- Supabase gibt anon und authenticated auf jede neue Tabelle alle Rechte.
-- anon braucht hier nichts, authenticated kein UPDATE (eine Anfrage wird
-- nicht geändert, nur angenommen oder gelöscht).
revoke all on public.folge_anfragen from anon, authenticated;
grant select, delete on public.folge_anfragen to authenticated;
grant insert (von, an) on public.folge_anfragen to authenticated;

-- Wer eine Bestätigung verlangt. SECURITY DEFINER, damit die Policies
-- unten nicht vom Spaltenrecht auf profiles abhängen (vgl. 0134).
create or replace function public.folgen_braucht_bestaetigung(p_ziel uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select p.folgen_bestaetigen from public.profiles p
      where p.id = p_ziel and p.geloescht_am is null),
    false
  );
$$;

create policy "Beteiligte sehen ihre Folgeanfragen"
  on public.folge_anfragen for select
  using ((select auth.uid()) = von or (select auth.uid()) = an);

-- Anfragen nur an Konten, die eine Bestätigung verlangen, und nur, wenn man
-- nicht schon folgt.
create policy "Nutzer stellen Folgeanfragen"
  on public.folge_anfragen for insert
  with check (
    (select auth.uid()) = von
    and public.folgen_braucht_bestaetigung(an)
    and not exists (
      select 1 from public.follows f
      where f.follower_id = von and f.followed_id = an
    )
  );

-- Zurückziehen (von) und Ablehnen (an) sind beides ein Löschen.
create policy "Beteiligte löschen Folgeanfragen"
  on public.folge_anfragen for delete
  using ((select auth.uid()) = von or (select auth.uid()) = an);

-- ---------------------------------------------------------------------
-- C) Annehmen
-- ---------------------------------------------------------------------
-- SECURITY DEFINER, weil die follows-Zeile dem Anfragenden gehört
-- (follower_id = von): die Insert-Policy auf follows lässt nur eigene
-- Zeilen zu. Die Funktion setzt nur Anfragen um, die an den Aufrufer
-- gerichtet sind.
create or replace function public.folgeanfrage_annehmen(p_von uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_gefunden boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  delete from public.folge_anfragen
   where von = p_von and an = auth.uid();
  v_gefunden := found;

  if v_gefunden then
    insert into public.follows (follower_id, followed_id)
    values (p_von, auth.uid())
    on conflict do nothing;
  end if;

  return v_gefunden;
end;
$$;

-- Wer die Bestätigung ausschaltet, nimmt alle offenen Anfragen an — sonst
-- warteten Leute auf eine Antwort, die niemand mehr geben muss.
create or replace function public.folgeanfragen_alle_annehmen()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.follows (follower_id, followed_id)
  select fa.von, fa.an from public.folge_anfragen fa where fa.an = auth.uid()
  on conflict do nothing;

  delete from public.folge_anfragen where an = auth.uid();
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

-- ---------------------------------------------------------------------
-- D) Lesen für /aktivitaet
-- ---------------------------------------------------------------------
-- Wie recent_follows_received (0100): keine Parameter, nur auth.uid(),
-- Avatar nur mit zeigt_avatar.
create or replace function public.offene_folgeanfragen()
returns table (
  von uuid,
  display_name text,
  avatar_url text,
  erstellt_am timestamptz,
  neu boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    fa.von,
    p.display_name,
    case when p.zeigt_avatar then p.avatar_url else null end,
    fa.erstellt_am,
    fa.erstellt_am > (
      select pr.follows_gesehen_am from public.profiles pr where pr.id = auth.uid()
    )
  from public.folge_anfragen fa
  join public.profiles p on p.id = fa.von
  where fa.an = auth.uid()
    and p.geloescht_am is null
  order by fa.erstellt_am desc
  limit 50;
$$;

-- Katalogstand vom 2026-09-25 plus ungesehene Folgeanfragen. Sie teilen
-- sich follows_gesehen_am mit den neuen Followern: /aktivitaet markiert
-- beides mit mark_activity_seen, und die Anfrage bleibt danach oben in der
-- Liste stehen, bis sie beantwortet ist — nur das Abzeichen geht weg.
create or replace function public.count_unseen_activity()
returns bigint
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
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
    (
      select count(*)
      from public.folge_anfragen fa
      where fa.an = auth.uid()
        and fa.erstellt_am > (
          select p.follows_gesehen_am from public.profiles p where p.id = auth.uid()
        )
    )
    +
    (
      select count(*)
      from public.pass_folgen pf
      join public.pass_ereignisse e
        on e.pass_id = pf.pass_id
       and e.erfasst_am > pf.erstellt_am
      where pf.user_id = auth.uid()
        and public.pass_ereignis_meldenswert(e.zustand, e.vorher)
        and e.erfasst_am > (
          select p.paesse_gesehen_am from public.profiles p where p.id = auth.uid()
        )
    );
$$;

-- Supabase-Voreinstellung: anon bekommt EXECUTE direkt, "from public"
-- allein nimmt es nicht weg (0047/0048/0091).
revoke execute on function public.folgen_braucht_bestaetigung(uuid) from public, anon;
revoke execute on function public.folgeanfrage_annehmen(uuid) from public, anon;
revoke execute on function public.folgeanfragen_alle_annehmen() from public, anon;
revoke execute on function public.offene_folgeanfragen() from public, anon;
grant execute on function public.folgen_braucht_bestaetigung(uuid) to authenticated;
grant execute on function public.folgeanfrage_annehmen(uuid) to authenticated;
grant execute on function public.folgeanfragen_alle_annehmen() to authenticated;
grant execute on function public.offene_folgeanfragen() to authenticated;

-- ---------------------------------------------------------------------
-- E) Kontolöschung: Stand aus 0145 plus die Anfragen in beide Richtungen.
--    deleteAccount() anonymisiert statt auth.users zu löschen, das
--    on delete cascade oben greift also nicht.
-- ---------------------------------------------------------------------
create or replace function public.anonymize_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_user_id is null then
    raise exception 'anonymize_account: p_user_id darf nicht NULL sein';
  end if;

  update public.profiles
  set
    display_name = null,
    avatar_url = null,
    stripe_customer_id = null,
    zeigt_fahrzeuge = false,
    zeigt_avatar = false,
    zeigt_paesse = false,
    zeigt_hoehenmeter = false,
    zeigt_distanz = false,
    zeigt_follower_liste = false,
    zeigt_tempo = false,
    zeigt_premium_badge = false,
    is_moderator = false,
    ist_premium = false,
    geloescht_am = coalesce(geloescht_am, now())
  where id = p_user_id;

  update public.route_completions
  set
    track = null,
    track_oeffentlich = null,
    tempoprofil = null,
    hoehen_quelle = null,
    fuer_follower = false,
    ist_oeffentlich = case when art = 'frei' then false else ist_oeffentlich end
  where user_id = p_user_id;

  delete from public.vehicles where user_id = p_user_id;

  delete from public.subscriptions where user_id = p_user_id;

  delete from public.saisonpaesse where user_id = p_user_id;

  delete from public.premium_gratis where user_id = p_user_id;

  delete from public.registrierung_herkunft where user_id = p_user_id;

  update public.creator_konversionen
  set user_id = null
  where user_id = p_user_id;

  update public.creator_links
  set creator_user_id = null
  where creator_user_id = p_user_id;

  delete from public.fahrt_starts
   where user_id = p_user_id
      or eingeloest_von = p_user_id;

  delete from public.pass_folgen where user_id = p_user_id;

  delete from public.folge_anfragen
   where von = p_user_id
      or an = p_user_id;
end;
$$;
