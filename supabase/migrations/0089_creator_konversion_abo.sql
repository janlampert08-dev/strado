-- =====================================================================
-- Der Kauf, Monate später: ein Abo dem Creator zuschreiben, über dessen
-- Link das Konto entstanden ist.
--
-- Das ist der Punkt der ganzen Übung. 0088 hält fest, WER über wen kam;
-- hier wird festgehalten, dass daraus ein zahlender Nutzer geworden ist —
-- auch wenn zwischen Registrierung und Kauf zwei Monate liegen.
--
-- ---------------------------------------------------------------------
-- Warum ein Trigger auf der Tabelle und nicht der naheliegende Ort
-- ---------------------------------------------------------------------
-- Im Webhook-Handler (app/api/stripe/webhook/route.ts): der ist nicht der
-- einzige Schreiber. confirmSubscription() in lib/actions/billing.ts
-- schreibt denselben Zustand, beide über apply_subscription_state. Die
-- Erfassung müsste an zwei Stellen stehen, ein dritter Aufrufer später
-- auch — und sie liefe ausserhalb der Transaktion, in der der Zustand
-- geschrieben wird.
--
-- In apply_subscription_state selbst: hiesse, die Funktion aus 0059 per
-- create or replace neu zu schreiben. Das sind 120 Zeilen Protected-Area-
-- Logik mit Advisory Lock, Kulanzfrist und Veralterungsprüfung, angefasst,
-- um zehn Zeilen anzuhängen. Jede Abweichung beim Abschreiben wäre ein
-- Fehler im Abo-Zustand selbst.
--
-- Der Trigger fängt beide heutigen Schreibwege und jeden künftigen, läuft
-- in derselben Transaktion und lässt 0059 unberührt.
--
-- ---------------------------------------------------------------------
-- Was der Trigger NICHT tut
-- ---------------------------------------------------------------------
-- Er kennt kein Attributionsfenster. Er erfasst, dass an diesem Tag ein
-- über Code X geworbenes Konto zahlend wurde, und schreibt das
-- Registrierungsdatum daneben. Ob 60 Tage noch zählen und 200 nicht mehr,
-- entscheidet die Abfrage — siehe docs/herkunft-tracking-plan.md,
-- Schritt 7. Was nicht erfasst wurde, ist weg; was falsch ausgewertet
-- wurde, wird nochmal ausgewertet.
-- =====================================================================

create function public.creator_konversion_abo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_registriert timestamptz;
  v_ist_premium boolean;
begin
  select h.code into v_code
  from public.registrierung_herkunft h
  where h.user_id = new.user_id;

  -- Kein Creator dahinter: nichts zu tun. Das ist der Normalfall und
  -- bleibt es auch — die allermeisten Konten entstehen ohne Link.
  if v_code is null then
    return new;
  end if;

  select p.created_at into v_registriert
  from public.profiles p
  where p.id = new.user_id;

  -- Dieselbe Funktion, die über profiles.ist_premium entscheidet (0059).
  -- Damit heisst "zahlender Nutzer" hier exakt dasselbe wie überall sonst
  -- in der App, statt eine zweite Statusliste zu pflegen, die beim
  -- nächsten Stripe-Status auseinanderläuft.
  v_ist_premium := public.subscription_ist_premium(new.status, new.kulanz_bis);

  if v_ist_premium then
    insert into public.creator_konversionen
      (code, art, user_id, stripe_subscription_id, ereignis_am, registriert_am)
    values
      (v_code, 'abo_start', new.user_id, new.stripe_subscription_id,
       now(), v_registriert)
    -- Der Unique-Index aus 0088 macht die Wiederholung zum No-op: Stripe
    -- liefert denselben Zustand mehrfach, und jede bezahlte Folgerechnung
    -- schreibt die Zeile erneut. Erfasst wird der erste Moment, in dem
    -- dieses Abo zahlend war.
    on conflict do nothing;
  else
    -- Ein Ende nur für ein Abo, dessen Anfang wir kennen. Ohne diese
    -- Prüfung bekäme eine Session, die als "incomplete" beginnt und nie
    -- bezahlt wird, sofort ein abo_ende ohne abo_start — ein Ende für
    -- etwas, das nie angefangen hat.
    insert into public.creator_konversionen
      (code, art, user_id, stripe_subscription_id, ereignis_am, registriert_am)
    select
      v_code, 'abo_ende', new.user_id, new.stripe_subscription_id,
      now(), v_registriert
    where exists (
      select 1 from public.creator_konversionen k
      where k.art = 'abo_start'
        and k.stripe_subscription_id = new.stripe_subscription_id
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

comment on function public.creator_konversion_abo() is
  'Traegt in creator_konversionen ein, wenn ein ueber einen Creator-Link geworbenes Konto zahlend wird (abo_start) bzw. es zum ersten Mal nicht mehr ist (abo_ende). Kennt kein Attributionsfenster — das ist Sache der Auswertung (0089).';

-- SECURITY DEFINER, und AGENTS.md verlangt dafür eine Begründung:
--
-- Der Trigger läuft im Kontext dessen, der subscriptions schreibt — heute
-- immer service_role, der creator_konversionen ohnehin erreicht. Nötig
-- wäre definer dafür also nicht. Er ist es trotzdem, damit die Tabelle
-- creator_konversionen KEINEN Grant an irgendeine andere Rolle braucht:
-- sie bleibt für anon und authenticated vollständig unerreichbar (0088),
-- und der einzige Schreibweg hinein ist dieser Trigger.
--
-- Was ihn ungefährlich macht: er trifft keine Berechtigungsentscheidung,
-- er liest keine Eingabe des Aufrufers, und sein einziger Input ist NEW
-- aus einer Tabelle, die ausschliesslich der Service-Role-Client
-- beschreiben kann. search_path ist gepinnt (0073).

create trigger subscriptions_creator_konversion
  after insert or update on public.subscriptions
  for each row execute function public.creator_konversion_abo();

-- EXECUTE liegt bei einer neuen Funktion standardmässig bei PUBLIC.
-- Entziehen und NICHT neu vergeben: eine Triggerfunktion ruft niemand
-- direkt auf, Postgres führt sie im Namen des Tabellenbesitzers aus.
-- Dieselbe Linie wie 0079 sie für die Kontingent-Trigger gezogen hat.
revoke execute on function public.creator_konversion_abo() from public;
revoke execute on function public.creator_konversion_abo() from anon, authenticated;

-- ---------------------------------------------------------------------
-- Zwei bekannte Lücken, damit sie niemand für Fehler hält
-- ---------------------------------------------------------------------
-- 1. Läuft eine Kulanzfrist ab, ohne dass Stripe ein Ereignis schickt,
--    schreibt premium_abgleich() (0059, per Cron) nur profiles.ist_premium
--    fort — subscriptions bleibt unberührt, dieser Trigger feuert also
--    nicht. Das abo_ende kommt dann erst mit dem nächsten Stripe-Ereignis.
-- 2. Eine Rückerstattung ohne Kündigung (charge.refunded) ändert
--    subscriptions nicht und wird hier nicht erfasst. Solange nicht
--    vergütet wird, ist das folgenlos; sobald vergütet wird, ist es die
--    erste Lücke, die geschlossen gehört (docs/herkunft-tracking-plan.md,
--    offene Entscheidung 3).
