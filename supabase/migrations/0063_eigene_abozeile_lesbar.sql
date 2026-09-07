-- Die eigene Abo-Zeile für die angemeldete Person lesbar machen.
--
-- 0059 hat subscriptions bewusst vollständig verschlossen: RLS an, keine
-- Policy, keine Grants. Das war richtig, solange nur der Webhook und der
-- nächtliche Abgleich mit dem Service-Role-Client darauf zugriffen.
--
-- Mit der Berechtigungsschicht (lib/premium.ts) kommt ein neuer Zugriffsweg
-- dazu: Server Components und Server Actions fragen "hat diese Person
-- Premium, bis wann, und ist die Zahlung offen?" — und zwar über den an die
-- Session gebundenen Client, nicht über den Service-Role-Client. Das ist
-- Absicht. Der Admin-Client umgeht RLS vollständig; ihn für eine
-- Berechtigungsfrage in einem nutzerseitigen Pfad zu verwenden, hiesse die
-- Zugriffsschranke genau dort aufzugeben, wo sie zählt (AGENTS.md,
-- Supabase-Regeln: eine genauere Policy statt eines Umwegs).
--
-- Zwei Schranken statt einer:
--
-- 1. ZEILEN — die Policy unten gibt genau die eigene Zeile frei. Kein Zugriff
--    auf fremde Abos, auch nicht lesend.
-- 2. SPALTEN — der Grant nennt die Spalten einzeln. Die Stripe-Kennungen
--    (stripe_subscription_id, stripe_customer_id, kulanz_invoice_id) bleiben
--    aussen vor. Sie werden in der Anwendung nirgends angezeigt, und
--    stripe_customer_id ist seit 0027 aus gutem Grund selbst am Profil für
--    anon/authenticated gesperrt: über einen direkten PostgREST-Aufruf wäre
--    sie sonst sichtbar, und die Kunden-Kennung ist der Schlüssel zu allem,
--    was bei Stripe an diesem Konto hängt.
--
-- Nur SELECT, kein INSERT/UPDATE/DELETE: der Abo-Zustand kommt
-- ausschliesslich aus apply_subscription_state, aufgerufen vom verifizierten
-- Webhook oder nach einer bei Stripe geprüften Zahlung. Dürfte die
-- angemeldete Person ihre eigene Zeile schreiben, wäre Premium ein
-- PostgREST-Aufruf weit.

create policy "Nutzer lesen ihr eigenes Abo"
  on public.subscriptions for select
  to authenticated
  using (user_id = auth.uid());

-- user_id gehört in den Grant, obwohl die Policy schon danach filtert:
-- Postgres verlangt das SELECT-Recht auch für Spalten, die nur in einer
-- WHERE-Bedingung vorkommen, und die Anwendung filtert ausdrücklich auf die
-- eigene Kennung.
--
-- price_id ist für sich genommen nichtssagend — die Zuordnung Preis-ID zu
-- Plan liegt in serverseitigen Umgebungsvariablen (lib/actions/billing.ts).
-- Sie steht hier, weil die Profilseite "Monatsabo" oder "Jahresabo"
-- benennen soll, und dieser Server-Code läuft ebenfalls unter diesem Grant.
grant select (
  user_id,
  status,
  price_id,
  current_period_end,
  cancel_at_period_end,
  kulanz_bis
) on public.subscriptions to authenticated;

-- anon bekommt nichts: ohne Anmeldung gibt es kein eigenes Abo.
--
-- Ausdrücklich hingeschrieben statt vorausgesetzt. 0059/0060 haben gezeigt,
-- wie leicht man sich bei Rechten täuscht: ein `revoke ... from public` sah
-- dort aus, als hätte es gewirkt, und hatte in Wahrheit nichts getan (siehe
-- supabase/migrations/README.md). Ein überflüssiges revoke kostet nichts,
-- ein fehlendes kostet das Feature.
revoke all on public.subscriptions from anon;
