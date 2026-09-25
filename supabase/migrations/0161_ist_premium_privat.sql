-- Abo-Status nicht mehr für jeden lesbar (profiles.ist_premium).
--
-- WARUM
--
-- 0034 hat anon UND authenticated einen Spalten-Grant zum Lesen von
-- ist_premium gegeben. Die SELECT-Policy auf profiles ist zeilenoffen
-- (öffentliche Profile) — ein direkter PostgREST-Request las damit den
-- Abo-Status JEDER Person, auch derer, die das Abzeichen ausdrücklich
-- verbergen (zeigt_premium_badge = false). 0087 hat das im Kopf
-- festgehalten und bewusst einem eigenen Schritt überlassen; das ist er.
-- Für die Anzeige fremder Profile gibt es seit 0087 die generierte Spalte
-- zeigt_premium_abzeichen (= ist_premium and zeigt_premium_badge), die
-- Bestenlisten-Views geben denselben verrechneten Wert aus (0027/0028).
--
-- Gemessen am 2026-09-25 (information_schema.column_privileges, pg_proc,
-- pg_views, pg_policies):
--   - Grants: nur Spalten-Grants, KEIN tabellenweites SELECT für anon oder
--     authenticated — der Spalten-Revoke unten reicht also.
--   - Wer ist_premium liest und unter authenticated läuft (bräche ohne
--     diese Datei):
--       darf_private_strecke_anlegen()  SECURITY INVOKER, EXECUTE für
--                                       authenticated (lib/premium.ts)
--       wartungseintraege/-erinnerungen je "anlegen/aendern mit Premium"
--                                       (4 Policies aus 0111, Unterabfrage
--                                       auf profiles als aufrufende Rolle)
--     Alle fünf lesen ab jetzt über mein_premium().
--   - Unberührt (laufen als Eigentümer postgres oder nur für service_role):
--       Views leaderboard_completions, route_leaderboard,
--         leaderboard_user_totals/_typ_totals/_klassen_totals — ohne
--         security_invoker, geben ohnehin nur (ist_premium and
--         zeigt_premium_badge) aus
--       private_strecke_kontingent_pruefen() (Trigger, DEFINER),
--       handle_new_user(), anonymize_account(), creator_konversion_abo()
--         (DEFINER), apply_subscription_state(), apply_saisonpass(),
--         saisonpass_erstatten(), premium_abgleich() (INVOKER, aber nur
--         service_role/postgres dürfen sie ausführen)
--   - App: einziger Leser unter authenticated ist getPremiumStatus() in
--     lib/premium.ts; Webhook, Abgleich-Cron und Kontolöschung lesen und
--     schreiben über den Service-Role-Client.
--
-- WAS SICH ÄNDERT
--
--   1. Neu: public.mein_premium() — ist_premium der angemeldeten Person,
--      festgelegt auf auth.uid(), false ohne Sitzung oder Profilzeile.
--      SECURITY DEFINER, EXECUTE nur für authenticated (wie
--      meine_privatzone() aus 0132).
--   2. darf_private_strecke_anlegen() und die vier Wartungs-Policies fragen
--      mein_premium() statt der Spalte. Ergebnis unverändert.
--   3. revoke select (ist_premium) von anon und authenticated.
--      Schreibrechte auf die Spalte hatten beide nie; daran ändert sich
--      nichts.
--
-- REIHENFOLGE
--
-- Erst NACH der Promotion staging → main einspielen. Der Code auf main
-- liest ist_premium direkt (getPremiumStatus); nach dieser Datei bekäme er
-- 42501 und würfe — Premium-, Profil-, Strecken- und Neue-Fahrt-Seiten
-- zeigten die Fehlerseite. Der neue Code ruft rpc("mein_premium") und
-- fällt auf die Spalte zurück, solange die Funktion fehlt (PGRST202): er
-- darf also vor dieser Migration laufen, auf Staging wie auf Produktion.
--
-- PRÜFEN (nach dem Einspielen)
--
--   select grantee, privilege_type from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name = 'ist_premium' and grantee in ('anon', 'authenticated');
--   -- erwartet: keine Zeile
--   select has_function_privilege('anon', 'public.mein_premium()', 'execute');           -- false
--   select has_function_privilege('authenticated', 'public.mein_premium()', 'execute');  -- true
--   select policyname, with_check from pg_policies
--    where tablename in ('wartungseintraege', 'wartungserinnerungen')
--      and with_check ilike '%ist_premium%';
--   -- erwartet: keine Zeile
-- In der App: als Premium-Konto /premium öffnen (Abo wird angezeigt), eine
-- private Strecke anlegen, einen Wartungseintrag speichern; als
-- Gratis-Konto /premium (Kaufseite) und Wartungsheft (gesperrt).
--
-- ZURÜCK
--
--   grant select (ist_premium) on public.profiles to anon, authenticated;
-- Funktion und umgestellte Policies dürfen stehen bleiben — sie liefern
-- dasselbe Ergebnis. (Der Code kommt mit beiden Zuständen zurecht.)

set lock_timeout = '5s';

-- 1. Der eigene Status -------------------------------------------------------

create or replace function public.mein_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.ist_premium
       from public.profiles p
      where p.id = (select auth.uid())),
    false
  );
$$;

comment on function public.mein_premium() is
  'Abo-Status (profiles.ist_premium) der angemeldeten Person (0161). Einziger Leseweg für authenticated, seit der Spalten-Grant entzogen ist — sonst läse jeder den Status jedes anderen.';

revoke all on function public.mein_premium() from public, anon;
grant execute on function public.mein_premium() to authenticated;

-- 2. Leser unter authenticated umstellen -------------------------------------

-- Unverändert bis auf die Premium-Abfrage (Stand 0086/0073). create or
-- replace behält Eigentümer und EXECUTE-Rechte.
create or replace function public.darf_private_strecke_anlegen()
returns table (erlaubt boolean, vorhanden integer, grenze integer, grund text)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_ist_premium boolean;
  v_bestandsschutz boolean;
  v_anzahl integer;
  v_grenze constant integer := 1;
begin
  if v_user_id is null then
    return query select false, 0, v_grenze, 'kontingent_erschoepft'::text;
    return;
  end if;

  v_ist_premium := public.mein_premium();

  select exists (
    select 1 from public.private_strecken_bestandsschutz b
    where b.user_id = v_user_id
  ) into v_bestandsschutz;

  select count(*)::integer into v_anzahl
  from public.routes r
  where r.erstellt_von = v_user_id and r.ist_privat;

  if coalesce(v_ist_premium, false) then
    return query select true, v_anzahl, null::integer, 'premium'::text;
  elsif v_bestandsschutz then
    return query select true, v_anzahl, null::integer, 'bestandsschutz'::text;
  elsif v_anzahl < v_grenze then
    return query select true, v_anzahl, v_grenze, 'kontingent_frei'::text;
  else
    return query select false, v_anzahl, v_grenze, 'kontingent_erschoepft'::text;
  end if;
end;
$$;

-- Wartungsheft (0111): Policies werten ihre Unterabfragen mit den Rechten
-- der aufrufenden Rolle aus; ohne Spalten-Grant schlüge jedes Anlegen und
-- Ändern mit 42501 fehl. (select ...) um den Aufruf: einmal pro Anweisung
-- statt pro Zeile ausgewertet.
alter policy "Wartungseintraege anlegen mit Premium" on public.wartungseintraege
  with check ((select auth.uid()) = user_id and (select public.mein_premium()));

alter policy "Wartungseintraege aendern mit Premium" on public.wartungseintraege
  using ((select auth.uid()) = user_id and (select public.mein_premium()))
  with check ((select auth.uid()) = user_id and (select public.mein_premium()));

alter policy "Wartungserinnerungen anlegen mit Premium" on public.wartungserinnerungen
  with check ((select auth.uid()) = user_id and (select public.mein_premium()));

alter policy "Wartungserinnerungen aendern mit Premium" on public.wartungserinnerungen
  using ((select auth.uid()) = user_id and (select public.mein_premium()))
  with check ((select auth.uid()) = user_id and (select public.mein_premium()));

-- 3. Grant entziehen ---------------------------------------------------------

revoke select (ist_premium) on public.profiles from anon, authenticated;

comment on column public.profiles.ist_premium is
  'Abo-Status, fortgeschrieben von Webhook und Abgleich (0059/0110). Seit 0161 nicht mehr für anon/authenticated lesbar; die Person selbst liest über mein_premium(), fremde Profile zeigen zeigt_premium_abzeichen (0087).';
