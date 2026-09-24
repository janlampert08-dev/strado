-- Durchschnittstempo auf geteilten Fahrten ausblenden (profiles.zeigt_tempo).
--
-- Anlass: ein Creator hat nach dem ersten Test gefragt, ob er die
-- Geschwindigkeit deaktivieren kann. Auf einer öffentlichen Fahrt stand bisher
-- für jeden Betrachter "Ø Tempo" — für jemanden, der seine Fahrten öffentlich
-- zeigt, heisst das: jede Fahrt ist eine Aussage darüber, wie schnell er auf
-- einer Passstrasse war. Die Zeit in der Rangliste bleibt davon unberührt.
--
-- Standard: AUS (verborgen), wie zeigt_distanz (0018) und
-- zeigt_follower_liste (0039). Das ist eine sichtbare Änderung für alle
-- bestehenden Konten: ihr Schnitt verschwindet von ihren geteilten Fahrten,
-- bis sie ihn einschalten. Der Fahrer selbst sieht sein Tempo immer.
--
-- Was das NICHT ist: ein Geheimnis. Distanz und Dauer einer geteilten Fahrt
-- bleiben öffentlich, wer will, rechnet den Schnitt selbst aus. Die Einstellung
-- entscheidet, ob Strado ihn ausweist — nicht, ob er sich ermitteln lässt.
-- So steht es auch in der Beschreibung des Schalters.
--
-- Grants wie bei 0039: lesbar für anon/authenticated (die Fahrtseite prüft das
-- Flag des Fahrers auch für abgemeldete Besucher), schreibbar nur für
-- authenticated, und dort begrenzt auf die eigene Zeile durch die bestehende
-- Update-Policy auf profiles.
--
-- `add column ... default false` schreibt die Tabelle nicht um (konstanter
-- Default).
--
-- anonymize_account setzt das Flag beim Löschen zurück. Nötig, weil
-- Streckenfahrten eines gelöschten Kontos öffentlich stehen bleiben (nur
-- freie Fahrten werden privat) — ein stehengebliebenes zeigt_tempo = true
-- würde ihren Schnitt weiter ausweisen. lib/accountDeletion.test.ts verlangt
-- das für jede profiles-Spalte. Der Rumpf ist der LIVE-Rumpf (am 2026-09-23
-- per pg_get_functiondef gelesen, identisch mit 0121) plus genau eine Zeile.

set lock_timeout = '5s';

alter table public.profiles
  add column zeigt_tempo boolean not null default false;

comment on column public.profiles.zeigt_tempo is
  'Durchschnittstempo auf geteilten Fahrten für andere zeigen (0125). Standard false. Der Besitzer sieht sein Tempo immer; Distanz und Dauer bleiben öffentlich.';

grant select (zeigt_tempo) on public.profiles to anon, authenticated;
grant update (zeigt_tempo) on public.profiles to authenticated;

create or replace function public.anonymize_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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
end;
$$;

-- Rechte wie 0121: create or replace behält sie ohnehin, wiederholt kostet es
-- nichts. Die Rollen ausgeschrieben, nicht nur "from public" (Falle aus 0047,
-- 0048, 0091, 0097).
revoke execute on function public.anonymize_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;

-- Rückweg (von Hand):
--   die Funktion aus 0121 (nur create or replace function anonymize_account)
--   erneut ausführen, danach alter table public.profiles drop column zeigt_tempo;
