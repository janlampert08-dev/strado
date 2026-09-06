-- Korrektur an apply_subscription_state (0059): ein veraltetes Abo darf ein
-- anderes, laufendes nicht entwerten.
--
-- subscriptions hat user_id als Primärschlüssel, es gibt also genau eine
-- Zeile pro Konto. Ein Konto kann bei Stripe aber durchaus zwei Abos haben:
-- createSubscriptionIntent verwendet ein unbezahltes Abo nur dann wieder,
-- wenn es zum selben Preis gehört — wer erst den Monats- und dann den
-- Jahresplan öffnet, hinterlässt zwei incomplete-Abos.
--
-- Daraus wird ohne diese Prüfung ein echter Fehler:
--   1. Abo A (Monat) und Abo B (Jahr) stehen beide auf incomplete.
--   2. Der Nutzer bezahlt B. Der Webhook schreibt die Zeile mit B,
--      ist_premium = true.
--   3. A läuft 23 Stunden nach seiner Erstellung in incomplete_expired.
--      Stripe schickt dafür ein Ereignis, das jetzt frisch abgerufen wird —
--      p_stripe_fetched_at ist also NEUER als der gespeicherte Stand und die
--      Veraltet-Prüfung aus 0059 greift nicht.
--   4. on conflict (user_id) überschreibt die Zeile mit A, und
--      ist_premium fällt auf false. Der Nutzer hat bezahlt und verliert
--      Premium — bis zum nächsten Ereignis oder nächtlichen Abgleich.
--
-- Die Prüfung unten verwirft in genau diesem Fall den Schreibvorgang: der
-- eingehende Zustand gehört zu einem ANDEREN Abo als dem gespeicherten, der
-- gespeicherte trägt Premium und der eingehende nicht. Bei gleicher Abo-ID
-- ändert sich nichts — ein Abo darf sich selbst jederzeit beenden.
--
-- Bewusst über subscription_ist_premium formuliert und nicht über den
-- Status: eine laufende Kulanzfrist zählt als premiumfähig, obwohl der
-- Status past_due lautet.
--
-- 0059 bleibt unangetastet (Kernregel 9); diese Migration ersetzt die
-- Funktion vollständig.

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
as $$
declare
  v_user_id uuid;
  v_vorher public.subscriptions%rowtype;
  v_kulanz_bis timestamptz;
  v_kulanz_invoice_id text;
  v_ist_premium boolean;
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

  -- NEU gegenüber 0059: ein fremdes, nicht mehr premiumfähiges Abo darf die
  -- Zeile eines laufenden nicht überschreiben.
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

  update public.profiles
  set ist_premium = v_ist_premium
  where id = v_user_id and ist_premium is distinct from v_ist_premium;

  if not v_ist_premium then
    update public.profiles
    set zeigt_premium_badge = false
    where id = v_user_id and zeigt_premium_badge = true;
  end if;

  return true;
end;
$$;

-- create or replace behält die bestehenden Grants; die Rechte aus 0060
-- (PUBLIC/anon/authenticated entzogen, service_role erlaubt) gelten weiter.
-- Zur Sicherheit trotzdem noch einmal ausdrücklich — ein stiller Verlust
-- dieser Einschränkung wäre genau die Lücke, die 0060 geschlossen hat.
revoke execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) from public, anon, authenticated;
grant execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) to service_role;
