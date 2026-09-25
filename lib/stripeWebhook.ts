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
// Strado verkauft genau eine Position pro Abo (ein Premium-Plan, Menge 1),
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
    // Eine Kündigung steht bei Stripe an ZWEI Stellen, je nach Weg: das
    // klassische cancel_at_period_end=true, oder — bei flexiblem
    // Abrechnungsmodus, den das Kundenportal (mode "at_period_end") nutzt —
    // ein gesetztes cancel_at bei cancel_at_period_end=false. Nur das erste
    // zu lesen hiess: ein über das Portal gekündigtes Abo stand in der
    // Datenbank weiter als verlängernd, und PremiumCard sagte der Person
    // direkt nach ihrer Kündigung "verlängert sich am …" (live gesehen am
    // 2026-09-24, Abo gekündigt am 19.09. mit cancel_at 16.10.).
    cancelAtPeriodEnd:
      subscription.cancel_at_period_end === true || typeof subscription.cancel_at === "number",
  };
}

// Die Preis-IDs, die Strado selbst verkauft — die einzigen, die Premium
// auslösen dürfen.
//
// Der Webhook-Endpunkt hängt an einem Stripe-KONTO, nicht an einem Produkt.
// Wer auf demselben Konto irgendwann etwas anderes verkauft (ein zweites
// Produkt, ein Testabo, eine Beratungsleistung), löst damit dieselben
// customer.subscription.*-Ereignisse aus. Bis hierher wurde die Preis-ID
// zwar ausgelesen und in apply_subscription_state geschrieben, aber nirgends
// dagegen geprüft, ob sie überhaupt zu einem Premium-Plan gehört — ein
// beliebiges Abo auf diesem Konto hätte Premium gesetzt (Audit-Befund A5,
// verbleibendes Bein).
//
// Die Gründer-Variable gehört dazu, obwohl der Preis seit 2026-09-07 nicht
// mehr verkauft wird: Bestandsabos erzeugen weiterhin Ereignisse, und die
// müssen weiter verarbeitet werden. Fällt die Variable weg, verlieren genau
// diese Konten ihre Zustandspflege — deshalb steht in .env.local.example,
// dass sie bestehende Abos benennt.
//
// STRIPE_PREMIUM_PRICE_ID ist der Alt-Name aus der Zeit vor der Monat/Jahr-
// Trennung; lib/actions/billing.ts fällt beim Kauf auf ihn zurück, also muss
// er auch hier gelten.
const PREIS_VARIABLEN = [
  "STRIPE_PREMIUM_PRICE_ID_MONAT",
  "STRIPE_PREMIUM_PRICE_ID_JAHR",
  "STRIPE_PREMIUM_PRICE_ID_GRUENDER",
  "STRIPE_PREMIUM_PRICE_ID",
] as const;

// Die Preise, die nicht mehr verkauft werden, deren Abos aber weiterlaufen.
//
// Seit der Preisrunde vom 2026-09-17 (CHF 6.90 / 39.00 statt 4.90 / 49.00,
// docs/premium-neu/preise.md) zeigen _MONAT und _JAHR auf neue Preis-IDs.
// Bestehende Abos behalten ihren Preis — Stripe bucht sie unter der ALTEN
// ID weiter ab. Stünde diese ID nirgends mehr, wäre jedes Ereignis dieser
// Abos "fremd": Kündigung, Zahlungsausfall, Verlängerung liefen am
// Datenbankzustand vorbei, und Premium bliebe nach einer Kündigung für
// immer an. Genau der Fehler, den der Absatz über den Gründerpreis oben
// beschreibt, nur für jeden Bestandskunden gleichzeitig.
//
// Kommagetrennt, weil jede künftige Preisänderung eine weitere alte ID
// hinterlässt. Getrennt nach Plan, weil lib/premium.ts das Abo weiterhin
// als "Monatsabo" oder "Jahresabo" benennen soll.
export const BESTAND_VARIABLEN = {
  monat: "STRIPE_PREMIUM_PRICE_IDS_MONAT_BESTAND",
  jahr: "STRIPE_PREMIUM_PRICE_IDS_JAHR_BESTAND",
} as const;

/** Liest eine kommagetrennte Liste von Preis-IDs aus einer Variablen. */
export function preisIdsAus(variable: string): string[] {
  return (process.env[variable] ?? "")
    .split(",")
    .map((wert) => wert.trim())
    .filter(Boolean);
}

export function bekanntePreisIds(): string[] {
  const ids = PREIS_VARIABLEN.map((name) => process.env[name]?.trim()).filter(
    (wert): wert is string => Boolean(wert),
  );
  const bestand = Object.values(BESTAND_VARIABLEN).flatMap(preisIdsAus);
  return [...new Set([...ids, ...bestand])];
}

// Der Saisonpass (0110) steht bewusst NICHT in bekanntePreisIds(): er ist
// kein Abo-Preis. Ein Abo auf dieser ID wäre ein Katalogfehler, und
// preisHerkunft() soll es als fremd überspringen statt Premium an einen
// Zustand zu hängen, den apply_subscription_state nicht verwalten kann.
export function saisonpassPreisId(): string | undefined {
  return process.env.STRIPE_PREMIUM_PRICE_ID_SAISONPASS?.trim() || undefined;
}

// Ein Saisonpass wird zurückgenommen, sobald seine Zahlung VOLLSTÄNDIG
// erstattet ist. Eine Teilerstattung (Kulanz, Rundung) lässt den Pass
// gelten — sonst nähme eine Geste von ein paar Franken den ganzen Zugang.
export function vollstaendigErstatteterPaymentIntent(charge: Stripe.Charge): string | null {
  if (!charge.refunded) return null;
  if (charge.amount_refunded < charge.amount) return null;
  return idVon(charge.payment_intent);
}

// Drei Ergebnisse, nicht zwei — der Unterschied entscheidet, ob ein
// Ereignis übersprungen oder laut gemeldet wird:
//
// - "premium": bekannte Preis-ID, ganz normal verarbeiten.
// - "fremd": das Konto verkauft hier etwas, das Strado nichts angeht.
//   Kein Fehler, sondern der Normalfall eines geteilten Stripe-Kontos —
//   überspringen und mit 200 quittieren, sonst liefert Stripe das Ereignis
//   endlos erneut aus.
// - "unkonfiguriert": KEINE einzige Preis-Variable gesetzt. Dann lässt sich
//   eigen und fremd nicht unterscheiden, und die stille Antwort wäre die
//   gefährliche: entweder bekämen alle Premium oder niemand. Das ist ein
//   Konfigurationsfehler und gehört laut gemeldet, nicht weggefiltert —
//   genau der Fehlermodus, aus dem A5 ursprünglich bestand.
export type PreisHerkunft = "premium" | "fremd" | "unkonfiguriert";

export function preisHerkunft(preisId: string): PreisHerkunft {
  const bekannt = bekanntePreisIds();
  if (bekannt.length === 0) return "unkonfiguriert";
  return bekannt.includes(preisId) ? "premium" : "fremd";
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
// ANSPRUCH_VERFAELLT_NACH_MS zu warten.
//
// Der Rückgabewert sagt, ob das gelungen ist. Er ist nicht dekorativ: bleibt
// der Anspruch stehen, sieht die nächste Zustellung ihn als 'in_arbeit' — und
// erst der 503 aus dem Handler sorgt dafür, dass Stripe es trotzdem weiter
// versucht, bis der Anspruch verfällt. Ein still verschluckter Fehler hier
// hätte genau diesen Zusammenhang unsichtbar gemacht.
export async function ereignisFreigeben(
  supabase: AdminClient,
  eventId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .delete()
    .eq("id", eventId)
    .eq("status", "in_arbeit");

  if (error) {
    console.error("Anspruch konnte nicht freigegeben werden", { eventId }, error);
    return false;
  }
  return true;
}
