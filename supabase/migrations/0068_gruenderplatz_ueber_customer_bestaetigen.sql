-- Gründerplatz auch aus dem Webhook heraus bestätigen können.
--
-- gruenderplatz_bestaetigen(p_user_id) aus 0066 braucht die Benutzer-Kennung.
-- Der Webhook (app/api/stripe/webhook/route.ts) hat die nicht: er kennt nur
-- die Stripe-Kunden-Kennung. Die Zuordnung liegt in
-- profiles.stripe_customer_id — dieselbe, die apply_subscription_state
-- ohnehin schon auflöst.
--
-- Warum der Webhook das überhaupt tun muss, obwohl confirmSubscription es
-- bereits tut: bei einer Weiterleitungs-Zahlungsart wie TWINT verlässt die
-- zahlende Person die Seite. Kehrt sie nicht zurück — Tab geschlossen,
-- Banking-App-Umweg abgebrochen, Netz weg —, läuft confirmSubscription nie.
-- Dann bliebe der Platz reserviert, liefe nach einer Stunde ab und wäre
-- wieder frei, obwohl bezahlt wurde. Beim 101. Abo fiele das auf.
--
-- Idempotent wie die Fassung mit user_id: ein doppelter Aufruf ändert
-- nichts, und beide Wege dürfen sich überschneiden.

create or replace function public.gruenderplatz_bestaetigen_fuer_customer(
  p_stripe_customer_id text
)
returns boolean
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from public.profiles
  where stripe_customer_id = p_stripe_customer_id;

  -- Kein Profil zu diesem Customer: gelöschtes Konto. Kein Fehler — es gibt
  -- dann auch keinen Platz zu bestätigen.
  if v_user_id is null then
    return false;
  end if;

  return public.gruenderplatz_bestaetigen(v_user_id);
end;
$$;

-- Nur der Webhook ruft das auf, und der läuft mit dem Service-Role-Client.
-- Bei Funktionen halten anon und authenticated das Ausführungsrecht als
-- DIREKTEN Grant aus Supabases Default-Privilegien — ein `revoke ... from
-- public` allein wäre wirkungslos (siehe supabase/migrations/README.md).
revoke execute on function public.gruenderplatz_bestaetigen_fuer_customer(text) from public, anon, authenticated;
grant execute on function public.gruenderplatz_bestaetigen_fuer_customer(text) to service_role;
