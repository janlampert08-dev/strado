-- Saisonpass: Premium für sechs Monate, einmal bezahlt, ohne Verlängerung.
--
-- WARUM ES DAS GIBT
--
-- docs/premium-naechste-features.md nennt den Hebel ohne Umschweife: ab
-- November fährt in diesem Land praktisch niemand mehr Töff, und ein Abo,
-- dessen Nutzen beim Fahren entsteht, wird genau dann gekündigt. Die
-- Konkurrenz hat daraus 2026 dieselbe Folgerung gezogen — calimoto verkauft
-- seit August einen Season Pass, Detecht, Cardo und RideLink führen
-- Sechsmonatspläne (docs/premium-neu/preise.md). Der Saisonpass nimmt
-- diese Entscheidung vorweg, statt sie jeden Herbst zu verlieren: wer nur
-- die Saison will, kauft die Saison.
--
-- WARUM EINE EINMALZAHLUNG UND KEIN ABO MIT KÜNDIGUNG
--
-- Die naheliegende Abkürzung wäre ein Stripe-Abo mit Sechsmonatsintervall,
-- das gleich nach dem Abschluss auf "kündigen zum Periodenende" gestellt
-- wird. Das nutzte die ganze Abo-Maschinerie mit — und verspräche trotzdem
-- etwas, das es nicht halten kann: Checkout kann cancel_at nicht beim
-- Anlegen setzen, die Kündigung liefe also in einem zweiten Aufruf nach der
-- Zahlung, und fällt der aus, verlängert sich ein Produkt, das "verlängert
-- sich nicht" heisst. Dazu kommt TWINT: für ein Abo legt TWINT eine
-- wiederkehrende Belastungsermächtigung an, die die zahlende Person in
-- ihrer App als "Abo" sieht. Beides ist bei einer Einmalzahlung
-- ausgeschlossen, nicht bloss unwahrscheinlich.
--
-- Der Preis dafür steht in dieser Datei: eine zweite Quelle für Premium
-- neben subscriptions. Die Projektion profiles.ist_premium ist ab hier
--
--     subscription_ist_premium(Abo)  ODER  ein gültiger Saisonpass
--
-- und jede Stelle, die sie schreibt, muss beide Hälften kennen. Das sind
-- genau drei: apply_subscription_state (Webhook, Bestätigung, Abgleich),
-- premium_abgleich (nächtlich) und die neue apply_saisonpass. Alle drei
-- stehen unten, und alle drei rechnen über dieselbe Hilfsfunktion
-- saisonpass_gueltig(), damit die Regel an genau einer Stelle steht.
--
-- WAS ERSETZT WIRD, UND GEGEN WELCHE FASSUNG
--
-- apply_subscription_state: zuletzt 0062 (Identitätsprüfung), search_path
-- aus 0073. Der Körper unten ist 0062 Anweisung für Anweisung, mit genau
-- einer Änderung — der Projektion am Schluss. Vor dem Einspielen den Live-
-- Körper lesen und vergleichen (AGENTS.md, "create or replace auf einer
-- Live-Funktion"):
--     select pg_get_functiondef('public.apply_subscription_state(text, text,
--       text, text, timestamptz, boolean, timestamptz, text, text, integer)'::regprocedure);
--
-- premium_abgleich: zuletzt 0059, search_path aus 0073.
--
-- anonymize_account: zuletzt 0092. Ergänzt um das Löschen der Pässe, sonst
-- bliebe nach einer Kontolöschung eine Zeile mit Stripe-Kennungen stehen,
-- und die Projektion würde für ein gelöschtes Konto Premium zurückholen.
--
-- DER WEG ZURÜCK
--
-- Die drei Funktionen auf die Körper aus 0062/0059/0092 zurücksetzen,
-- apply_saisonpass/saisonpass_erstatten/saisonpass_gueltig droppen. Die
-- Tabelle darf stehen bleiben (sie ist dann nur noch Beleg) — gelöscht
-- werden sollte sie nicht, solange ein verkaufter Pass noch läuft.

-- ---------------------------------------------------------------------------
-- Tabelle
-- ---------------------------------------------------------------------------

create table public.saisonpaesse (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Die Checkout-Session ist der natürliche Schlüssel eines Kaufs: Webhook
  -- und Bestätigung aus dem Browser kennen beide genau diese ID, und
  -- unique macht jede zweite Zustellung zum No-Op.
  stripe_checkout_session_id text not null unique,
  -- Für die Erstattung: charge.refunded trägt den PaymentIntent, nicht die
  -- Session.
  stripe_payment_intent_id text unique,
  stripe_customer_id text not null,
  price_id text not null,
  betrag_rappen integer not null check (betrag_rappen >= 0),
  waehrung text not null,
  gueltig_ab timestamptz not null,
  gueltig_bis timestamptz not null,
  -- Gesetzt bei vollständiger Erstattung. Ein erstatteter Pass gilt nicht
  -- mehr, bleibt aber als Beleg stehen.
  erstattet_am timestamptz,
  created_at timestamptz not null default now(),
  constraint saisonpass_zeitraum check (gueltig_bis > gueltig_ab)
);

comment on table public.saisonpaesse is
  'Einmal bezahlte Premium-Zeiträume ohne Verlängerung (0110). Geschrieben ausschliesslich über apply_saisonpass / saisonpass_erstatten mit dem Service-Role-Client. profiles.ist_premium ist die Projektion aus subscriptions ODER einem gültigen Pass.';

create index saisonpaesse_user_gueltig_idx
  on public.saisonpaesse (user_id, gueltig_bis desc);

alter table public.saisonpaesse enable row level security;

-- Dieselbe Zweiteilung wie 0063 für subscriptions: die eigene Zeile lesbar,
-- die Stripe-Kennungen nicht. Kein INSERT/UPDATE/DELETE für irgendwen
-- ausser service_role — sonst wäre Premium ein PostgREST-Aufruf weit.
create policy "Nutzer lesen ihre eigenen Saisonpaesse"
  on public.saisonpaesse for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.saisonpaesse from public, anon, authenticated;

grant select (
  id,
  user_id,
  betrag_rappen,
  waehrung,
  gueltig_ab,
  gueltig_bis,
  erstattet_am,
  created_at
) on public.saisonpaesse to authenticated;

-- ---------------------------------------------------------------------------
-- Die Regel: gilt für diese Person gerade ein Pass?
-- ---------------------------------------------------------------------------

create function public.saisonpass_gueltig(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.saisonpaesse s
    where s.user_id = p_user_id
      and s.erstattet_am is null
      and s.gueltig_ab <= now()
      and now() < s.gueltig_bis
  );
$$;

comment on function public.saisonpass_gueltig(uuid) is
  'Einzige Definition, wann ein Saisonpass Premium gewährt (0110). Wie subscription_ist_premium wird das Ergebnis in profiles.ist_premium gespeichert, nicht laufend ausgewertet — der Ablauf braucht premium_abgleich().';

-- ---------------------------------------------------------------------------
-- Kauf eintragen
-- ---------------------------------------------------------------------------

create function public.apply_saisonpass(
  p_stripe_customer_id text,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_price_id text,
  p_betrag_rappen integer,
  p_waehrung text,
  p_monate integer
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_ab timestamptz;
begin
  if p_monate is null or p_monate < 1 or p_monate > 12 then
    raise exception 'apply_saisonpass: unzulaessige Laufzeit %', p_monate;
  end if;

  -- Zuordnung über den Customer, genau wie apply_subscription_state: der
  -- Customer wurde serverseitig für die angemeldete Person angelegt, die
  -- Session-ID dagegen kann aus dem Browser kommen.
  select id into v_user_id
  from public.profiles
  where stripe_customer_id = p_stripe_customer_id;

  if v_user_id is null then
    return false;
  end if;

  -- Derselbe Schlüssel wie in apply_subscription_state: Abo und Pass einer
  -- Person werden nie gleichzeitig geschrieben.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- Zweite Zustellung desselben Kaufs (Webhook und Browser-Bestätigung
  -- laufen fast immer beide): nichts tun, aber als Erfolg melden.
  if exists (
    select 1 from public.saisonpaesse
    where stripe_checkout_session_id = p_stripe_checkout_session_id
  ) then
    return true;
  end if;

  -- Ein Pass, der gekauft wird, während ein anderer noch läuft, schliesst
  -- an dessen Ende an, statt die Restlaufzeit zu verschlucken. Die Kaufseite
  -- lässt das nur kurz vor Ablauf zu (lib/actions/billing.ts); hier gilt es
  -- unabhängig davon, weil eine zweite Zahlung nie weniger wert sein darf
  -- als die erste.
  select greatest(now(), coalesce(max(s.gueltig_bis), now())) into v_ab
  from public.saisonpaesse s
  where s.user_id = v_user_id
    and s.erstattet_am is null
    and s.gueltig_bis > now();

  insert into public.saisonpaesse (
    user_id, stripe_checkout_session_id, stripe_payment_intent_id,
    stripe_customer_id, price_id, betrag_rappen, waehrung,
    gueltig_ab, gueltig_bis
  ) values (
    v_user_id, p_stripe_checkout_session_id, p_stripe_payment_intent_id,
    p_stripe_customer_id, p_price_id, p_betrag_rappen, lower(p_waehrung),
    v_ab, v_ab + make_interval(months => p_monate)
  );

  update public.profiles
  set ist_premium = true
  where id = v_user_id and ist_premium is distinct from true;

  return true;
end;
$$;

comment on function public.apply_saisonpass is
  'Traegt einen bei Stripe bezahlten Saisonpass ein und setzt die Projektion profiles.ist_premium (0110). Idempotent je Checkout-Session, serialisiert je Nutzer, schliesst an einen laufenden Pass an. Nur fuer den Service-Role-Client.';

-- ---------------------------------------------------------------------------
-- Erstattung
-- ---------------------------------------------------------------------------

create function public.saisonpass_erstatten(p_stripe_payment_intent_id text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_abo public.subscriptions%rowtype;
  v_soll boolean;
begin
  select user_id into v_user_id
  from public.saisonpaesse
  where stripe_payment_intent_id = p_stripe_payment_intent_id;

  if v_user_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  update public.saisonpaesse
  set erstattet_am = coalesce(erstattet_am, now())
  where stripe_payment_intent_id = p_stripe_payment_intent_id;

  select * into v_abo from public.subscriptions where user_id = v_user_id;

  v_soll := coalesce(public.subscription_ist_premium(v_abo.status, v_abo.kulanz_bis), false)
    or public.saisonpass_gueltig(v_user_id);

  update public.profiles
  set ist_premium = v_soll
  where id = v_user_id and ist_premium is distinct from v_soll;

  return true;
end;
$$;

comment on function public.saisonpass_erstatten(text) is
  'Markiert einen vollstaendig erstatteten Saisonpass und zieht profiles.ist_premium nach (0110). Nur fuer den Service-Role-Client (Webhook charge.refunded).';

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
-- anonymize_account: Körper aus 0092, um die Pässe ergänzt
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
end;
$$;

comment on function public.anonymize_account(uuid) is
  'Anonymisiert ein Konto anhand der uebergebenen ID. Nur fuer service_role — der Aufrufer muss die Identitaet bereits festgestellt haben (deleteAccount() in lib/actions/auth.ts: Passwort-Neueingabe, dann Stripe-Kuendigung, dann diese Funktion mit der getUser()-ID). Loescht seit 0076 die subscriptions-Zeile, seit 0090 die Creator-Herkunft (in creator_konversionen wird nur der Personenbezug genullt), gibt seit 0092 zugewiesene Creator-Codes wieder frei und loescht seit 0110 die Saisonpaesse.';

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
--
-- Alle Rollen ausdrücklich. Ein `revoke ... from public` allein lässt den
-- direkten anon-Grant stehen, den Supabase jeder neuen Funktion in public
-- mitgibt — die Falle aus 0047, 0048, 0091 und 0097. `create or replace`
-- behält die bestehenden Rechte einer Funktion; sie hier trotzdem zu
-- wiederholen kostet nichts und macht die Datei für sich lesbar.

revoke execute on function public.saisonpass_gueltig(uuid) from public, anon, authenticated;
revoke execute on function public.apply_saisonpass(text, text, text, text, integer, text, integer) from public, anon, authenticated;
revoke execute on function public.saisonpass_erstatten(text) from public, anon, authenticated;
revoke execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) from public, anon, authenticated;
revoke execute on function public.premium_abgleich() from public, anon, authenticated;
revoke execute on function public.anonymize_account(uuid) from public, anon, authenticated;

grant execute on function public.saisonpass_gueltig(uuid) to service_role;
grant execute on function public.apply_saisonpass(text, text, text, text, integer, text, integer) to service_role;
grant execute on function public.saisonpass_erstatten(text) to service_role;
grant execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) to service_role;
grant execute on function public.premium_abgleich() to service_role;
grant execute on function public.anonymize_account(uuid) to service_role;
