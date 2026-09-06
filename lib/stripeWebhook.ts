import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// Abo-Zustand in genau der Form, in der ihn apply_subscription_state
// (0059_premium_abo_zustand.sql) entgegennimmt. Bewusst als reine
// Umformung eines Stripe-Objekts modelliert: so ist der Zustandsübergang
// ohne Netzwerk und ohne Datenbank testbar, während der Handler nur noch
// Abruf und Schreibvorgang verdrahtet.
export interface AboZustand {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
  priceId: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

// Was mit der Kulanzfrist geschehen soll. Die Entscheidung selbst fällt in
// der Datenbank (sie braucht den aktuellen Zeilenstand), hier wird nur die
// Absicht des Ereignisses übersetzt.
export type KulanzAktion = "unveraendert" | "setzen" | "loeschen";

export const KULANZ_TAGE = 7;

function idVon(feld: string | { id: string } | null | undefined): string | null {
  if (!feld) return null;
  return typeof feld === "string" ? feld : feld.id;
}

// Seit API-Version 2025-03-31.basil hängt current_period_end nicht mehr am
// Abo selbst, sondern an dessen Positionen — dasselbe gilt für den Preis.
// Cornice verkauft genau eine Position pro Abo (ein Premium-Plan, Menge 1),
// deshalb ist die erste Position die maßgebliche; mehr als eine wäre ein
// Konfigurationsfehler im Stripe-Katalog und keine hier zu lösende Frage.
export function leseAboZustand(subscription: Stripe.Subscription): AboZustand | null {
  const stripeCustomerId = idVon(subscription.customer);
  const position = subscription.items?.data?.[0];
  const priceId = position ? idVon(position.price) : null;

  // Ohne Customer oder Preis lässt sich der Zustand niemandem zuordnen. Das
  // ist kein erwarteter Fall, darf den Handler aber nicht mit einer
  // Ausnahme abbrechen — der Aufrufer entscheidet, was er meldet.
  if (!stripeCustomerId || !priceId) return null;

  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId,
    status: subscription.status,
    priceId,
    currentPeriodEnd:
      typeof position?.current_period_end === "number"
        ? new Date(position.current_period_end * 1000).toISOString()
        : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

// Die Abo-ID aus einem Rechnungs-Ereignis. Seit Basil hängt sie nicht mehr
// direkt an der Rechnung, sondern unter parent.subscription_details.
export function leseAboIdAusRechnung(invoice: Stripe.Invoice): string | null {
  return idVon(invoice.parent?.subscription_details?.subscription);
}

// Ereignisse, die einen Abo-Zustand betreffen, samt der Wirkung auf die
// Kulanzfrist. Alles, was hier nicht steht, ist für den Premium-Status
// bedeutungslos und wird vom Handler übersprungen.
export function kulanzAktionFuer(eventType: string): KulanzAktion | null {
  switch (eventType) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return "unveraendert";
    // Erfolgreiche Zahlung beendet eine laufende Frist — aber nur die zu
    // genau dieser Rechnung, siehe apply_subscription_state.
    case "invoice.paid":
      return "loeschen";
    case "invoice.payment_failed":
      return "setzen";
    default:
      return null;
  }
}

// Ein Anspruch auf ein Ereignis, das noch niemand verarbeitet hat.
export type EreignisAnspruch =
  // Dieser Aufruf verarbeitet das Ereignis.
  | { art: "uebernommen" }
  // Schon abgeschlossen: Wiederholung, nichts zu tun.
  | { art: "erledigt" }
  // Ein anderer Aufruf ist gerade dran. Nicht doppelt verarbeiten; scheitert
  // jener, sorgt dessen eigene Wiederholung für den zweiten Versuch.
  | { art: "in_arbeit" };

// Ein Anspruch gilt als verwaist, wenn er lange genug offen ist, dass der
// beanspruchende Aufruf nicht mehr laufen kann. Vercels Function-Timeout
// liegt weit darunter, fünf Minuten sind also grosszügig und verhindern
// trotzdem, dass ein abgestürzter Aufruf das Ereignis dauerhaft blockiert.
export const ANSPRUCH_VERFAELLT_NACH_MS = 5 * 60 * 1000;

// Stripe stellt jedes Ereignis mindestens einmal zu, also auch mehrfach.
// Der Anspruch wird VOR der Verarbeitung geschrieben, aber erst DANACH als
// erledigt markiert. Die frühere Fassung markierte sofort als erledigt und
// verwarf damit jede Wiederholung — schlug der Schreibvorgang danach fehl,
// blieb ein zahlender Nutzer ohne Premium, ohne dass irgendwo ein Fehler
// sichtbar wurde.
export async function ereignisBeanspruchen(
  supabase: AdminClient,
  eventId: string,
  eventType: string,
  jetzt: Date = new Date(),
): Promise<EreignisAnspruch> {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .insert({ id: eventId, type: eventType, status: "in_arbeit", received_at: jetzt.toISOString() });

  if (!error) return { art: "uebernommen" };
  if ((error as { code?: string }).code !== "23505") throw error;

  const { data: vorhanden, error: leseFehler } = await supabase
    .from("stripe_webhook_events")
    .select("status, received_at")
    .eq("id", eventId)
    .maybeSingle();

  if (leseFehler) throw leseFehler;
  if (!vorhanden) return { art: "in_arbeit" };
  if (vorhanden.status === "erledigt") return { art: "erledigt" };

  const verfallsgrenze = new Date(jetzt.getTime() - ANSPRUCH_VERFAELLT_NACH_MS).toISOString();
  if (vorhanden.received_at > verfallsgrenze) return { art: "in_arbeit" };

  // Verwaister Anspruch: der vorherige Aufruf ist gestorben, ohne
  // abzuschliessen. Übernehmen, damit das Ereignis nicht für immer
  // unverarbeitet bleibt.
  //
  // Die Bedingungen gehören in das UPDATE selbst und nicht in ein if davor:
  // stellen zwei Aufrufe gleichzeitig fest, dass derselbe Anspruch verfallen
  // ist, würde sonst jeder von beiden übernehmen und das Ereignis doppelt
  // verarbeitet. So gewinnt genau einer — der andere sieht eine leere
  // Trefferliste und hält sich heraus.
  const { data: uebernommen, error: uebernahmeFehler } = await supabase
    .from("stripe_webhook_events")
    .update({ received_at: jetzt.toISOString() })
    .eq("id", eventId)
    .eq("status", "in_arbeit")
    .lt("received_at", verfallsgrenze)
    .select("id");

  if (uebernahmeFehler) throw uebernahmeFehler;
  return (uebernommen?.length ?? 0) > 0 ? { art: "uebernommen" } : { art: "in_arbeit" };
}

export async function ereignisAbschliessen(supabase: AdminClient, eventId: string): Promise<void> {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({ status: "erledigt", completed_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) throw error;
}

// Gibt den Anspruch nach einem Fehlschlag wieder frei, damit Stripes
// Wiederholung sofort einen neuen Versuch bekommt statt auf den Ablauf von
// ANSPRUCH_VERFAELLT_NACH_MS zu warten. Schlägt auch das fehl, ist das kein
// Grund, den Fehlerpfad abzubrechen: der Anspruch verfällt dann eben über
// die Zeit.
export async function ereignisFreigeben(supabase: AdminClient, eventId: string): Promise<void> {
  await supabase.from("stripe_webhook_events").delete().eq("id", eventId).eq("status", "in_arbeit");
}
