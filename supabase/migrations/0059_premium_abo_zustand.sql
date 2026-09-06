-- Abo-Zustand für das Premium-Abo (Phase 1 aus docs/premium-plan.md).
--
-- Bisher kannte die Anwendung nur profiles.ist_premium — ein blankes Boolean
-- ohne Status, Plan, Periodenende oder Kulanzfrist. Damit lässt sich weder
-- "gekündigt, läuft noch bis TT.MM." anzeigen noch eine fehlgeschlagene
-- Zahlung überbrücken, und der Webhook konnte nur an/aus schalten.
--
-- Diese Migration führt subscriptions als kanonische Quelle ein.
-- profiles.ist_premium bleibt die einzige Lesequelle der Anwendung (alle
-- bestehenden Views, Policies und Abfragen hängen daran und bleiben
-- unverändert), ist ab jetzt aber ausdrücklich nur noch eine Projektion
-- dieser Tabelle, geschrieben von apply_subscription_state unten.

create table public.subscriptions (
  -- Eine Zeile pro Nutzer: ein Konto hat höchstens ein aktives Abo. Ein
  -- Planwechsel ersetzt die Zeile, statt eine zweite anzulegen.
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_subscription_id text unique not null,
  stripe_customer_id text not null,
  -- Stripe-Status unverändert gespiegelt (active, trialing, past_due,
  -- canceled, incomplete, ...). Bewusst kein Enum: eine neue Stripe-Status-
  -- Bezeichnung soll den Webhook nicht mit einem Constraint-Fehler
  -- abbrechen lassen.
  status text not null,
  price_id text not null,
  -- Nullable, obwohl Stripe für Abo-Positionen praktisch immer ein
  -- Periodenende liefert: ein fehlender Wert darf den Webhook nicht in eine
  -- Endlosschleife aus 500ern schicken, denn der Wert trägt keine
  -- Berechtigungsentscheidung (siehe subscription_ist_premium unten).
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Kulanzfrist bei fehlgeschlagener Zahlung: Premium bleibt bis zu diesem
  -- Zeitpunkt bestehen, obwohl der Status past_due ist.
  kulanz_bis timestamptz,
  -- Die Rechnung, welche die laufende Frist ausgelöst hat. Stripes Smart
  -- Retries erzeugen für dieselbe Rechnung mehrere
  -- invoice.payment_failed-Ereignisse; ohne diese Spalte würde jedes weitere
  -- die Frist verlängern und damit unbezahltes Premium beliebig fortsetzen.
  kulanz_invoice_id text,
  -- Zeitpunkt, zu dem der geschriebene Zustand von Stripe abgerufen wurde.
  -- Dient dem Verwerfen veralteter Schreibvorgänge (siehe
  -- apply_subscription_state) und der Nachvollziehbarkeit — ausdrücklich
  -- NICHT als Reihenfolgenkriterium für Stripe-Ereignisse: event.created hat
  -- nur Sekundenauflösung und taugt dafür laut Stripe nicht.
  stripe_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is
  'Kanonischer Abo-Zustand pro Nutzer, gespiegelt von Stripe. Geschrieben ausschliesslich über apply_subscription_state (Stripe-Webhook und confirmSubscription, beide mit Service-Role-Client). profiles.ist_premium ist nur die Projektion dieser Tabelle.';

-- Wie stripe_webhook_events (0026): RLS an, keine einzige Policy für
-- anon/authenticated — die Tabelle ist ausschliesslich über den
-- Service-Role-Client erreichbar, der RLS ohnehin umgeht. Abo- und
-- Zahlungsdaten haben im Browser nichts verloren; die Anwendung liest
-- Premium weiterhin über profiles.ist_premium.
alter table public.subscriptions enable row level security;

-- Zusätzlich die Tabellen-Grants entziehen. RLS ohne Policy blockt bereits,
-- aber 0034 hat gezeigt, dass Supabase neuen Tabellen per Default GRANT ALL
-- an anon/authenticated gibt und man sich auf eine einzelne Schutzschicht
-- besser nicht verlässt.
revoke all on public.subscriptions from anon, authenticated;

-- Die gemeinsame Projektionsregel, damit Webhook, Abgleich und jede spätere
-- Abfrage exakt dieselbe Definition von "ist premium" benutzen statt sie zu
-- duplizieren. stable statt immutable wegen now().
create function public.subscription_ist_premium(
  p_status text,
  p_kulanz_bis timestamptz
) returns boolean
language sql
stable
as $$
  select p_status in ('active', 'trialing')
      or (p_status = 'past_due' and p_kulanz_bis is not null and now() < p_kulanz_bis);
$$;

comment on function public.subscription_ist_premium(text, timestamptz) is
  'Einzige Definition der Premium-Berechtigung aus einem Abo-Zustand. Achtung: das Ergebnis wird in profiles.ist_premium gespeichert, nicht laufend ausgewertet — der Ablauf einer Kulanzfrist braucht deshalb premium_abgleich().';

-- Schreibt den von Stripe geholten Abo-Zustand und zieht profiles.ist_premium
-- in einem Zug nach. Beides gehört in dieselbe Transaktion: eine Zeile ohne
-- passende Projektion (oder umgekehrt) wäre genau der Zustand, den die
-- kanonische Quelle verhindern soll.
--
-- Bewusst OHNE security definer: aufgerufen wird die Funktion nur vom
-- Service-Role-Client, der RLS ohnehin umgeht — eine Funktion mit erhöhten
-- Rechten wäre zusätzliche Angriffsfläche ohne Nutzen (vgl. die Lehre aus
-- 0022/0023). Das execute-Recht wird unten PUBLIC entzogen.
--
-- p_kulanz_aktion steuert die Kulanzfrist, weil die Entscheidung den
-- aktuellen Zeilenstand braucht und deshalb hier drin fallen muss:
--   'unveraendert' — Frist bleibt, wie sie ist (normale Abo-Ereignisse)
--   'setzen'       — nur setzen, wenn für diese Rechnung noch keine läuft
--   'loeschen'     — nur löschen, wenn die Frist zu genau dieser Rechnung
--                    gehört (ein verspätetes invoice.paid einer älteren
--                    Rechnung darf die Frist einer neueren nicht beenden)
create function public.apply_subscription_state(
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

  -- Kein Profil zu diesem Customer: kann legitim vorkommen (gelöschtes Konto
  -- nullt stripe_customer_id, siehe 0058). Kein Fehler, aber auch nichts zu
  -- tun — der Aufrufer erfährt es am false und kann es protokollieren.
  if v_user_id is null then
    return false;
  end if;

  -- Serialisiert konkurrierende Schreibvorgänge für dasselbe Konto bis zum
  -- Ende der Transaktion. Auf user_id statt auf der Subscription-ID, weil
  -- user_id die zu schreibende Zeile identifiziert: zwei verschiedene Abos
  -- desselben Nutzers (Planwechsel, Doppelanlage) konkurrieren um dieselbe
  -- Zeile und müssen sich denselben Lock teilen.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select * into v_vorher from public.subscriptions where user_id = v_user_id;

  -- Veralteten Schreibvorgang verwerfen: wurde der übergebene Zustand vor
  -- dem bereits gespeicherten von Stripe geholt, ist er älter und darf den
  -- neueren nicht überschreiben. Schliesst das Rennen zweier gleichzeitig
  -- verarbeiteter Ereignisse (Abruf A, Abruf B, Schreiben B, Schreiben A).
  if v_vorher.user_id is not null and p_stripe_fetched_at < v_vorher.stripe_updated_at then
    return false;
  end if;

  v_kulanz_bis := v_vorher.kulanz_bis;
  v_kulanz_invoice_id := v_vorher.kulanz_invoice_id;

  if p_kulanz_aktion = 'setzen' then
    -- Nur die erste fehlgeschlagene Zahlung einer Rechnung startet die
    -- Frist. Jeder weitere Versuch derselben Rechnung lässt sie unberührt.
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

  -- Eine Kulanzfrist ergibt nur bei past_due Sinn. Wechselt der Status auf
  -- etwas anderes (bezahlt, gekündigt), verfällt sie — sonst bliebe ein
  -- toter Zeitstempel liegen, der bei einem späteren Rückfall auf past_due
  -- fälschlich als laufende Frist gälte.
  if p_status <> 'past_due' then
    v_kulanz_bis := null;
    v_kulanz_invoice_id := null;
  end if;

  v_ist_premium := public.subscription_ist_premium(p_status, v_kulanz_bis);

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

  -- Das Abzeichen ist ein Opt-in, das nur mit Premium wirkt. Fällt Premium
  -- weg, wird es hier zurückgesetzt, damit ein späteres erneutes Abo es
  -- nicht unbemerkt wieder aufleben lässt.
  if not v_ist_premium then
    update public.profiles
    set zeigt_premium_badge = false
    where id = v_user_id and zeigt_premium_badge = true;
  end if;

  return true;
end;
$$;

comment on function public.apply_subscription_state is
  'Schreibt den von Stripe geholten Abo-Zustand und die Projektion profiles.ist_premium in einer Transaktion. Serialisiert pro Nutzer per Advisory Lock und verwirft Schreibvorgänge mit älterem Abrufzeitpunkt. Nur für den Service-Role-Client.';

-- Der Ablauf einer Kulanzfrist erzeugt kein Stripe-Ereignis. Ohne diesen
-- Abgleich bliebe profiles.ist_premium nach dem Ende der sieben Tage auf
-- true stehen — die Bedingung "now() < kulanz_bis" wird nur beim Schreiben
-- ausgewertet, nicht laufend. Damit ist der Abgleich Teil der
-- Berechtigungslogik, nicht der Beobachtbarkeit.
--
-- Fasst bewusst NUR Nutzer an, die eine subscriptions-Zeile haben, also über
-- Stripe verwaltet werden. Ein per Hand gesetztes ist_premium (so war es vor
-- der Zahlungsanbindung vorgesehen, siehe 0021) bleibt unangetastet — sonst
-- würde dieser Lauf stillschweigend Berechtigungen entziehen, die jemand
-- absichtlich vergeben hat.
create function public.premium_abgleich()
returns table (user_id uuid, ist_premium_neu boolean)
language sql
as $$
  with soll as (
    select
      s.user_id,
      public.subscription_ist_premium(s.status, s.kulanz_bis) as ist_premium_neu
    from public.subscriptions s
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
      and p.ist_premium is distinct from soll.ist_premium_neu
    returning p.id, p.ist_premium
  )
  select id, ist_premium from geaendert;
$$;

comment on function public.premium_abgleich() is
  'Zieht profiles.ist_premium für alle über Stripe verwalteten Nutzer auf die Projektion nach — insbesondere für abgelaufene Kulanzfristen, die kein Stripe-Ereignis auslösen. Rührt manuell gesetztes Premium ohne subscriptions-Zeile nicht an.';

-- Zweiphasige Idempotenz für den Webhook (0026 legte die Tabelle an).
--
-- Bisher galt ein Ereignis in dem Moment als verarbeitet, in dem seine ID
-- geschrieben wurde — also VOR den Seiteneffekten. Schlug danach das UPDATE
-- fehl, war das Ereignis dauerhaft als erledigt vermerkt und Stripes
-- Wiederholung wurde stumm verworfen: ein zahlender Nutzer blieb ohne
-- Premium, ohne Fehlerbild. Jetzt markiert der Handler erst nach
-- erfolgreichem Seiteneffekt als 'erledigt'.
--
-- Default 'erledigt', damit die bereits vorhandenen Zeilen (allesamt unter
-- dem alten Schema fertig verarbeitet) nicht plötzlich als offen gelten und
-- erneut ausgeführt werden.
alter table public.stripe_webhook_events
  add column status text not null default 'erledigt'
    check (status in ('in_arbeit', 'erledigt')),
  add column completed_at timestamptz;

comment on column public.stripe_webhook_events.status is
  'in_arbeit: beansprucht, Seiteneffekt läuft noch. erledigt: Seiteneffekt erfolgreich abgeschlossen — erst dann ist eine erneute Zustellung wirklich ein No-Op.';

-- Postgres vergibt EXECUTE auf neue Funktionen per Default an PUBLIC. Genau
-- daran ist 0027 gescheitert: ein revoke gegen anon/authenticated ist eine
-- stille No-Op, solange das Recht über PUBLIC kommt (siehe
-- supabase/migrations/README.md). Also PUBLIC entziehen und gezielt nur der
-- Service-Rolle geben.
revoke execute on function public.subscription_ist_premium(text, timestamptz) from public;
revoke execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) from public;
revoke execute on function public.premium_abgleich() from public;

grant execute on function public.subscription_ist_premium(text, timestamptz) to service_role;
grant execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) to service_role;
grant execute on function public.premium_abgleich() to service_role;
