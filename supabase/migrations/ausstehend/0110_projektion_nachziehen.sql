-- AUSSTEHEND: die Projektion von 0110 nachziehen
--
-- WAS HIER FEHLT, UND WARUM DIE DATEI EXISTIERT
--
-- Am 2026-09-18 wurde 0110_saisonpass.sql eingespielt — aber nur zur Hälfte.
-- Angewendet sind (Ledger `0110_saisonpass_tabelle`,
-- `0110_saisonpass_funktionen`, `0110_saisonpass_rechte_entziehen`):
--   * die Tabelle public.saisonpaesse samt RLS, Policy und Spalten-Grants,
--   * saisonpass_gueltig(), apply_saisonpass(), saisonpass_erstatten(),
--   * die Rechte dazu (anon/authenticated haben kein EXECUTE, service_role
--     schon).
--
-- NICHT angewendet sind die drei `create or replace` unten. Der Versuch
-- wurde von der Berechtigungsprüfung der Sitzung abgewiesen, in der die
-- Migration lief: das Ersetzen bestehender Produktionsfunktionen —
-- darunter anonymize_account, SECURITY DEFINER — braucht eine Freigabe, die
-- dort nicht vorlag. Der Rest ist dadurch nicht kaputt, aber unvollständig:
--
--   * Ein gekaufter Saisonpass schaltet Premium sofort frei
--     (apply_saisonpass setzt profiles.ist_premium selbst).
--   * Er LÄUFT ABER NIE AB. premium_abgleich() kennt die Tabelle noch
--     nicht, und ein Pass löst an seinem Ende kein Stripe-Ereignis aus.
--   * Ein Abo-Ereignis eines Pass-Inhabers (Kündigung, Zahlungsausfall)
--     würde Premium wegnehmen, obwohl der Pass noch gilt:
--     apply_subscription_state kennt die zweite Quelle noch nicht.
--   * Eine Kontolöschung lässt die Pass-Zeile stehen.
--
-- Solange diese Datei nicht eingespielt ist, darf der Saisonpass NICHT
-- verkauft werden: die Stripe-Preis-ID gehört dann nicht in
-- STRIPE_PREMIUM_PRICE_ID_SAISONPASS (ohne die Variable lässt
-- getPremiumAngebot() den Plan einfach weg). Abo und Testphase sind davon
-- unberührt und funktionieren wie bisher.
--
-- VOR DEM EINSPIELEN
--
-- Die drei Live-Körper erneut auslesen und gegen diese Datei halten — seit
-- dem 2026-09-18 kann sie ein anderer Zweig angefasst haben:
--
--     select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('apply_subscription_state', 'premium_abgleich', 'anonymize_account');
--
-- Der anonymize_account-Körper unten enthält bereits die Ergänzungen aus
-- 0101 (fahrt_starts) und aus der Pässe-Migration (pass_folgen). Kommt eine
-- weitere dazu, gehört sie hier hinein, bevor die Datei läuft — sonst dreht
-- dieses `create or replace` sie still zurück.
--
-- DANACH PRÜFEN
--
--     -- Erwartet: true für alle drei (die Projektion kennt den Pass).
--     select position('saisonpass_gueltig' in prosrc) > 0 as kennt_pass, proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and proname in ('apply_subscription_state', 'premium_abgleich');
--
--     -- Erwartet: true — die Kontolöschung räumt die Pässe weg.
--     select position('saisonpaesse' in prosrc) > 0 from pg_proc
--     where proname = 'anonymize_account';
--
--     -- Erwartet: unverändert anon=false, authenticated=false.
--     select proname,
--            has_function_privilege('anon', oid, 'EXECUTE') as anon,
--            has_function_privilege('authenticated', oid, 'EXECUTE') as authed
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and proname in ('apply_subscription_state', 'premium_abgleich', 'anonymize_account');
--
-- Der Weg zurück: dieselben drei Funktionen auf die Körper aus 0062, 0059
-- und dem Live-Stand vom 2026-09-18 zurücksetzen (im Kopf von
-- 0110_saisonpass.sql steht, woraus sie bestehen).

-- ---------------------------------------------------------------------------
-- apply_subscription_state: Körper aus 0062, Projektion um den Pass ergänzt
-- ---------------------------------------------------------------------------

create or replace function public.apply_subscription_state(
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_price_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_stripe_fetched_at timestamptz,
  p_kulanz_aktion text default 'unveraendert',
  p_kulanz_invoice_id text default null,
  p_kulanz_tage integer default 7
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_vorher public.subscriptions%rowtype;
  v_kulanz_bis timestamptz;
  v_kulanz_invoice_id text;
  v_ist_premium boolean;
  -- Neu in 0110: was in profiles.ist_premium landet. v_ist_premium bleibt
  -- die Aussage über das ABO allein, weil die Identitätsprüfung aus 0062
  -- genau diese Aussage braucht — ein laufender Pass darf nicht dazu
  -- führen, dass ein fremdes, beendetes Abo ein laufendes überschreibt.
  v_projektion boolean;
begin
  if p_kulanz_aktion not in ('unveraendert', 'setzen', 'loeschen') then
    raise exception 'unbekannte kulanz_aktion: %', p_kulanz_aktion;
  end if;

  select id into v_user_id
  from public.profiles
  where stripe_customer_id = p_stripe_customer_id;

  if v_user_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select * into v_vorher from public.subscriptions where user_id = v_user_id;

  if v_vorher.user_id is not null and p_stripe_fetched_at < v_vorher.stripe_updated_at then
    return false;
  end if;

  v_kulanz_bis := v_vorher.kulanz_bis;
  v_kulanz_invoice_id := v_vorher.kulanz_invoice_id;

  if p_kulanz_aktion = 'setzen' then
    if v_kulanz_bis is null or v_kulanz_invoice_id is distinct from p_kulanz_invoice_id then
      v_kulanz_bis := now() + make_interval(days => p_kulanz_tage);
      v_kulanz_invoice_id := p_kulanz_invoice_id;
    end if;
  elsif p_kulanz_aktion = 'loeschen' then
    if v_kulanz_invoice_id is not distinct from p_kulanz_invoice_id then
      v_kulanz_bis := null;
      v_kulanz_invoice_id := null;
    end if;
  end if;

  if p_status <> 'past_due' then
    v_kulanz_bis := null;
    v_kulanz_invoice_id := null;
  end if;

  v_ist_premium := public.subscription_ist_premium(p_status, v_kulanz_bis);

  if v_vorher.user_id is not null
     and v_vorher.stripe_subscription_id is distinct from p_stripe_subscription_id
     and public.subscription_ist_premium(v_vorher.status, v_vorher.kulanz_bis)
     and not v_ist_premium then
    return false;
  end if;

  insert into public.subscriptions as s (
    user_id, stripe_subscription_id, stripe_customer_id, status, price_id,
    current_period_end, cancel_at_period_end, kulanz_bis, kulanz_invoice_id,
    stripe_updated_at, updated_at
  ) values (
    v_user_id, p_stripe_subscription_id, p_stripe_customer_id, p_status, p_price_id,
    p_current_period_end, p_cancel_at_period_end, v_kulanz_bis, v_kulanz_invoice_id,
    p_stripe_fetched_at, now()
  )
  on conflict (user_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_customer_id = excluded.stripe_customer_id,
    status = excluded.status,
    price_id = excluded.price_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    kulanz_bis = excluded.kulanz_bis,
    kulanz_invoice_id = excluded.kulanz_invoice_id,
    stripe_updated_at = excluded.stripe_updated_at,
    updated_at = now();

  -- Die einzige Änderung gegenüber 0062: ein beendetes Abo nimmt Premium
  -- nicht weg, solange ein bezahlter Pass läuft.
  v_projektion := v_ist_premium or public.saisonpass_gueltig(v_user_id);

  update public.profiles
  set ist_premium = v_projektion
  where id = v_user_id and ist_premium is distinct from v_projektion;

  if not v_projektion then
    update public.profiles
    set zeigt_premium_badge = false
    where id = v_user_id and zeigt_premium_badge = true;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- premium_abgleich: Körper aus 0059, um die Pass-Inhaber erweitert
-- ---------------------------------------------------------------------------
--
-- Vorher lief der Abgleich nur über subscriptions. Ein Pass löst an seinem
-- Ende kein Stripe-Ereignis aus — ohne diese Erweiterung bliebe Premium
-- nach Ablauf für immer an. Deshalb läuft die Soll-Menge jetzt über alle
-- Personen mit einer Abo-Zeile ODER einem Pass.
--
-- Unverändert: wer weder das eine noch das andere hat (Premium von Hand
-- gesetzt), wird nicht angefasst. Eine Person mit Handeintrag UND einem
-- abgelaufenen Pass verliert Premium beim nächsten Lauf — das ist gewollt,
-- der Handeintrag war dann nicht der Grund für den Zugang.
--
-- Zweite, kleine Abweichung von 0059: anonymisierte Profile
-- (geloescht_am gesetzt) werden übersprungen. anonymize_account löscht Abo
-- und Pässe ohnehin; die Bedingung ist das Netz für den Fall, dass eine
-- Zeile einen Löschlauf überlebt hat.

create or replace function public.premium_abgleich()
returns table (user_id uuid, ist_premium_neu boolean)
language sql
set search_path = public, pg_temp
as $$
  with personen as (
    select s.user_id from public.subscriptions s
    union
    select p.user_id from public.saisonpaesse p
  ),
  soll as (
    select
      personen.user_id,
      coalesce(public.subscription_ist_premium(s.status, s.kulanz_bis), false)
        or public.saisonpass_gueltig(personen.user_id) as ist_premium_neu
    from personen
    left join public.subscriptions s on s.user_id = personen.user_id
  ),
  geaendert as (
    update public.profiles p
    set ist_premium = soll.ist_premium_neu,
        zeigt_premium_badge = case
          when soll.ist_premium_neu then p.zeigt_premium_badge
          else false
        end
    from soll
    where p.id = soll.user_id
      and p.geloescht_am is null
      and p.ist_premium is distinct from soll.ist_premium_neu
    returning p.id, p.ist_premium
  )
  select id, ist_premium from geaendert;
$$;

-- ---------------------------------------------------------------------------
-- anonymize_account: Live-Körper (0092 + 0101 + Pässe), um die Saisonpässe
-- ergänzt — siehe die Begründung im Kopf dieser Datei
-- ---------------------------------------------------------------------------

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
    zeigt_premium_badge = false,
    is_moderator = false,
    ist_premium = false,
    geloescht_am = coalesce(geloescht_am, now())
  where id = p_user_id;

  update public.route_completions
  set
    track = null,
    track_oeffentlich = null,
    ist_oeffentlich = case when art = 'frei' then false else ist_oeffentlich end
  where user_id = p_user_id;

  delete from public.vehicles where user_id = p_user_id;

  delete from public.subscriptions where user_id = p_user_id;

  -- Neu in 0110. Die Zahlungsbelege liegen bei Stripe (Aufbewahrungspflicht),
  -- nicht hier; hier stünde nach der Löschung nur eine Stripe-Kennung ohne
  -- Konto — und premium_abgleich würde für das anonymisierte Profil Premium
  -- zurückholen.
  delete from public.saisonpaesse where user_id = p_user_id;

  delete from public.registrierung_herkunft where user_id = p_user_id;

  update public.creator_konversionen
  set user_id = null
  where user_id = p_user_id;

  update public.creator_links
  set creator_user_id = null
  where creator_user_id = p_user_id;

  -- Aus 0101_anonymisierung_fahrtstarts — unverändert übernommen.
  delete from public.fahrt_starts
   where user_id = p_user_id
      or eingeloest_von = p_user_id;

  -- Aus der Pässe-Migration vom 2026-09-17 — unverändert übernommen.
  delete from public.pass_folgen where user_id = p_user_id;
end;
$$;

comment on function public.anonymize_account(uuid) is
  'Anonymisiert ein Konto anhand der uebergebenen ID. Nur fuer service_role — der Aufrufer muss die Identitaet bereits festgestellt haben (deleteAccount() in lib/actions/auth.ts: Passwort-Neueingabe, dann Stripe-Kuendigung, dann diese Funktion mit der getUser()-ID). Loescht seit 0076 die subscriptions-Zeile, seit 0090 die Creator-Herkunft (in creator_konversionen wird nur der Personenbezug genullt), gibt seit 0092 zugewiesene Creator-Codes wieder frei, loescht seit 0101 die Fahrtstarts, seit der Paesse-Migration die gefolgten Paesse und seit 0110 die Saisonpaesse.';

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
--
-- Alle Rollen ausdrücklich. Ein `revoke ... from public` allein lässt den
-- direkten anon-Grant stehen, den Supabase jeder neuen Funktion in public
-- mitgibt — die Falle aus 0047, 0048, 0091 und 0097. `create or replace`
-- behält die bestehenden Rechte einer Funktion; sie hier trotzdem zu
-- wiederholen kostet nichts und macht die Datei für sich lesbar.

-- Die Rechte der drei ersetzten Funktionen bleiben durch `create or replace`
-- erhalten; ausgeschrieben, weil ein überflüssiges revoke nichts kostet und
-- ein fehlendes das Feature (0047, 0048, 0091, 0097).
revoke execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) from public, anon, authenticated;
revoke execute on function public.premium_abgleich() from public, anon, authenticated;
revoke execute on function public.anonymize_account(uuid) from public, anon, authenticated;

grant execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) to service_role;
grant execute on function public.premium_abgleich() to service_role;
grant execute on function public.anonymize_account(uuid) to service_role;
