// Reine Umformungen und Prüfungen rund um eine Stripe-Checkout-Session.
//
// Warum hier und nicht in lib/actions/billing.ts: eine Datei mit "use server"
// darf ausschliesslich async Functions exportieren, ist also nicht
// prüfbar — und Vitest läuft in diesem Projekt nur über lib/ (AGENTS.md).
// Genauso ist leseAboZustand aus dem Webhook-Handler herausgezogen: der
// Zustandsübergang ist ohne Netz und ohne Datenbank testbar, der Aufrufer
// verdrahtet nur noch Abruf und Schreibvorgang.
//
// Was hier steht, entscheidet, ob jemand Premium bekommt. Die Session-ID
// kommt aus dem Browser bzw. aus der Adresszeile und ist damit eine
// Nutzereingabe — die Bindung an den eigenen Customer ist die Prüfung, die
// "Premium mit einer fremden Session-ID einschalten" verhindert.
import Stripe from "stripe";
import type { VergebenerPreis } from "./premiumLimits";

function idVon(feld: string | { id: string } | null | undefined): string | null {
  if (!feld) return null;
  return typeof feld === "string" ? feld : feld.id;
}

/**
 * Der Betrag, den genau diese Session einziehen wird.
 *
 * Er kommt aus der Session selbst und nicht aus einer zweiten Abfrage des
 * Preises: was Stripe abbucht, steht in amount_total, und nur diese Zahl
 * darf auf der Schaltfläche stehen, die die Zahlungspflicht auslöst.
 * null heisst "hier steht kein Betrag" — der Aufrufer entscheidet, ob er
 * auf den Katalogpreis zurückfällt oder abbricht.
 */
export function preisVonSession(session: Stripe.Checkout.Session): VergebenerPreis | null {
  if (typeof session.amount_total !== "number" || !session.currency) return null;
  return { betragRappen: session.amount_total, waehrung: session.currency };
}

/**
 * Wie eine Session zahlt — vom Server beim Anlegen in die Metadaten
 * geschrieben, nie vom Browser.
 *
 * - "sofort": die erste Zahlung fällt mit dem Abschluss an (Monat, Jahr,
 *   Saisonpass). Das ist auch die Lesart für Sessions, die vor 0110
 *   angelegt wurden und das Feld nicht kennen.
 * - "testphase": Jahresabo mit Gratis-Testphase (TESTPHASE_TAGE).
 * - "anschluss": Abo, das erst mit dem Ende eines laufenden Saisonpasses
 *   zu zahlen beginnt.
 *
 * In den beiden letzten Fällen ist die Session mit "no_payment_required"
 * abgeschlossen. Dass das dann ein Erfolg ist, darf nur gelten, wenn der
 * Server es beim Anlegen so bestimmt hat — deshalb das Feld.
 */
export type ZahlungsVariante = "sofort" | "testphase" | "anschluss";

export function varianteVonSession(session: Stripe.Checkout.Session): ZahlungsVariante {
  const wert = session.metadata?.variante;
  return wert === "testphase" || wert === "anschluss" ? wert : "sofort";
}

/**
 * Eine noch offene Session für denselben Preis, die wiederverwendet werden
 * kann — statt daneben eine zweite anzulegen.
 *
 * Ohne diese Wiederverwendung legte jeder Aufruf eine neue Session an: wer
 * die Kaufseite zweimal öffnet oder neu lädt, erzeugte zwei offene Sessions,
 * und wer beide bezahlt, zahlt doppelt für dasselbe Konto.
 *
 * Verglichen wird gegen die in den Metadaten mitgeschriebene Preis-ID: die
 * Positionen einer Session kommen erst mit einem expand mit, und die
 * Metadaten sind ohnehin der Weg, eine Session im Dashboard einem Plan
 * zuzuordnen. Eine Session ohne Betrag zählt nicht als brauchbar — siehe
 * preisVonSession.
 *
 * Seit 0110 zählen Modus und Zahlungsvariante mit: eine offene Session ohne
 * Testphase darf nicht wiederverwendet werden, wenn inzwischen eine
 * zustünde (oder umgekehrt), und ein Saisonpass läuft als Einmalzahlung
 * ("payment"), nicht als Abo.
 */
export function passendeOffeneSession(
  sessions: Stripe.Checkout.Session[],
  preisId: string,
  erwartet: { modus: "subscription" | "payment"; variante: ZahlungsVariante } = {
    modus: "subscription",
    variante: "sofort",
  },
): Stripe.Checkout.Session | null {
  return (
    sessions.find(
      (session) =>
        session.mode === erwartet.modus &&
        session.ui_mode === "elements" &&
        session.metadata?.price_id === preisId &&
        varianteVonSession(session) === erwartet.variante &&
        Boolean(session.client_secret) &&
        preisVonSession(session) !== null,
    ) ?? null
  );
}

/**
 * Die offenen Sessions, die beim Anlegen oder Wiederaufnehmen einer Session
 * ablaufen müssen: alle ausser der, die gerade weiterverwendet wird.
 *
 * Ohne das liessen sich zwei offene Sessions für verschiedene Pläne beide
 * bezahlen — Saisonpass im einen Tab, Jahresabo im anderen. Die Prüfung auf
 * ein aktives Abo in checkoutSessionMitCustomer hilft dort nicht: beide
 * Sessions sind angelegt, bevor eine davon bezahlt ist. Dieselbe Lücke
 * besteht zwischen zwei Abo-Plänen (Monat und Jahr), und dort ist sie
 * teurer — mit zwei Abos kippt die einzeilige subscriptions-Tabelle.
 *
 * Nur Sessions im ui_mode "elements": eine andere Art Session auf demselben
 * Customer (etwa eine gehostete aus dem Dashboard) hat mit dieser Kasse
 * nichts zu tun und wird nicht angefasst.
 */
export function abzulaufendeSessions(
  offene: Stripe.Checkout.Session[],
  behaltenId: string | null,
): Stripe.Checkout.Session[] {
  return offene.filter(
    (session) =>
      session.status === "open" && session.ui_mode === "elements" && session.id !== behaltenId,
  );
}

/**
 * Gehört diese Session dem eigenen Konto, und ist sie tatsächlich bezahlt?
 *
 * Der Session-Status allein reicht nicht: "complete" sagt, dass der Ablauf
 * durch ist, nicht dass Geld geflossen ist. payment_status ist die Zusage
 * darüber.
 *
 * "no_payment_required" gilt nur, wenn der Server die Session beim Anlegen
 * ausdrücklich so gebaut hat (Testphase oder Anschluss an einen Pass, siehe
 * ZahlungsVariante). Bis 0110 wurde es ohne Ausnahme abgewiesen, weil es
 * keinen Gratis-Zeitraum gab; eine Session ohne diese Markierung, die
 * trotzdem nichts kostet, ist weiterhin unerwartet und kein Kauf.
 * aktivesAboAusSession prüft dazu das Abo selbst.
 */
export function istEigeneBezahlteSession(
  session: Stripe.Checkout.Session,
  eigenerCustomerId: string,
): boolean {
  if (idVon(session.customer) !== eigenerCustomerId) return false;
  if (session.mode !== "subscription") return false;
  if (session.status !== "complete") return false;
  if (session.payment_status === "paid") return true;
  return session.payment_status === "no_payment_required" && varianteVonSession(session) !== "sofort";
}

/**
 * Der Saisonpass aus einer bezahlten Session des eigenen Kontos — oder null.
 *
 * Getrennt von istEigeneBezahlteSession, weil ein Pass kein Abo ist: Modus
 * "payment", kein Abo-Objekt, und ein Gratis-Fall existiert nicht (ein Pass
 * für CHF 0 wäre ein Fehler im Katalog, kein Kauf).
 *
 * `eigenerCustomerId` null heisst "Zuordnung übernimmt der Aufrufer" — der
 * Webhook kennt kein angemeldetes Konto und ordnet in apply_saisonpass über
 * den Customer zu. Aus dem Browser (confirmCheckoutSession) wird immer die
 * eigene ID übergeben.
 *
 * `erwartetePreisId`: die konfigurierte Saisonpass-Preis-ID
 * (saisonpassPreisId() aus lib/stripeWebhook.ts). Steht sie, muss die Session
 * genau diesen Preis tragen — sonst wäre jede Einmalzahlung auf demselben
 * Stripe-Konto ein halbes Jahr Premium, dieselbe Verwechslung, die
 * preisHerkunft() für Abos verhindert. Ist sie leer/undefined (Preis noch
 * nicht angelegt, siehe docs/premium-neu/rollout.md), greift die Prüfung
 * nicht — die Session kann dann nur aus unserem eigenen Kauf stammen, weil
 * die Kaufseite den Plan ohne konfigurierten Preis gar nicht anbietet.
 */
export interface GekaufterSaisonpass {
  sessionId: string;
  customerId: string;
  paymentIntentId: string | null;
  preisId: string;
  betragRappen: number;
  waehrung: string;
}

export function saisonpassAusSession(
  session: Stripe.Checkout.Session,
  eigenerCustomerId: string | null,
  erwartetePreisId?: string | null,
): GekaufterSaisonpass | null {
  const customerId = idVon(session.customer);
  if (!customerId) return null;
  if (eigenerCustomerId !== null && customerId !== eigenerCustomerId) return null;
  if (session.mode !== "payment") return null;
  if (session.status !== "complete") return null;
  if (session.payment_status !== "paid") return null;
  if (session.metadata?.plan !== "saisonpass") return null;
  const preisId = session.metadata?.price_id;
  if (!preisId) return null;
  if (erwartetePreisId && preisId !== erwartetePreisId) return null;
  if (typeof session.amount_total !== "number" || session.amount_total <= 0) return null;
  if (!session.currency) return null;
  return {
    sessionId: session.id,
    customerId,
    paymentIntentId: idVon(session.payment_intent),
    preisId,
    betragRappen: session.amount_total,
    waehrung: session.currency,
  };
}

/**
 * Ein Stripe-Fehler vom Typ "unbekannter Customer" — z.B. weil
 * profiles.stripe_customer_id noch eine Test-Konto-ID trägt, während der
 * Server inzwischen mit dem Live-Schlüssel läuft (oder umgekehrt). Kunden-
 * und Preis-IDs sind bei Stripe pro Modus getrennte Namensräume; eine ID aus
 * dem anderen Modus existiert für den aktuell verwendeten Schlüssel schlicht
 * nicht — Stripe antwortet dann nicht mit einer diffusen Netzstörung,
 * sondern exakt mit diesem Fehler. createCheckoutSession
 * (lib/actions/billing.ts) nutzt das, um die veraltete ID zu verwerfen und
 * einmal mit einem neuen Customer neu zu versuchen.
 */
export function istUnbekannterCustomer(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeInvalidRequestError &&
    err.code === "resource_missing" &&
    err.param === "customer"
  );
}

/**
 * Ein Stripe-Fehler vom Typ "derselbe Idempotency-Key, andere Parameter".
 *
 * Stripe merkt sich zu einem Idempotency-Key die Parameter des ersten
 * Aufrufs — auch dann, wenn dieser Aufruf mit einem Fehler endete. Ein
 * späterer Aufruf mit demselben Key, aber abweichenden Parametern wird
 * deshalb hart abgewiesen, statt die Anfrage auszuführen.
 *
 * Das trifft genau die Fälle, in denen sich zwischen zwei Versuchen etwas
 * am Aufruf ändert: der Selbstheilungs-Versuch mit einem frisch angelegten
 * Customer (siehe istUnbekannterCustomer) und ein Deploy, der die
 * Session-Parameter erweitert, während im selben Zeitfenster noch ein
 * verbrannter Key aus der Vorversion liegt. checkoutIdempotencyKey unten
 * verhindert beides bereits im Schlüssel; diese Prüfung ist das Netz
 * darunter, damit ein solcher Konflikt keinen zahlenden Nutzer aussperrt.
 */
export function istIdempotencyKonflikt(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeIdempotencyError;
}

/**
 * Der Idempotency-Key für das Anlegen einer Checkout-Session.
 *
 * Er trägt jeden Wert, der den Aufruf inhaltlich unterscheidet — Customer
 * und Preis-ID eingeschlossen. Das ist kein Zierrat: lag im Key nur
 * (Nutzer, Plan, Stunde), dann benutzte der Wiederholungsversuch nach einem
 * unbekannten Customer denselben Key mit einer anderen customer-ID, und
 * Stripe wies ihn mit einem idempotency_error ab, statt die Session
 * anzulegen. Ein Wert, der sich ändert, muss auch den Schlüssel ändern.
 *
 * Der Stundenraster bleibt als Ablauf: zwei Klicks kurz hintereinander
 * bekommen dieselbe Session, ein bewusster neuer Anlauf später nicht mehr
 * die alte Antwort.
 *
 * `zusatz` erzwingt einen frischen Key, wenn der reguläre verbrannt ist —
 * siehe istIdempotencyKonflikt.
 */
export function checkoutIdempotencyKey(teile: {
  userId: string;
  plan: string;
  customerId: string;
  preisId: string;
  /** Millisekunden seit Epoch; Default ist die aktuelle Zeit. */
  jetzt?: number;
  zusatz?: string;
}): string {
  const stunde = Math.floor((teile.jetzt ?? Date.now()) / 3_600_000);
  const basis = `checkout:${teile.userId}:${teile.plan}:${teile.customerId}:${teile.preisId}:${stunde}`;
  return teile.zusatz ? `${basis}:${teile.zusatz}` : basis;
}

/**
 * Das Abo einer Session, sofern es ausgeklappt vorliegt und läuft.
 *
 * "trialing" zählt nur, wenn die Session selbst nichts zu zahlen hatte —
 * also eine Testphase oder ein Anschluss an einen Pass war. Ein Abo, das
 * nach einer echten Zahlung in "trialing" stünde, ist unerwartet und wird
 * dem Webhook überlassen statt hier bestätigt.
 */
export function aktivesAboAusSession(
  session: Stripe.Checkout.Session,
): Stripe.Subscription | null {
  const subscription = session.subscription;
  if (!subscription || typeof subscription !== "object") return null;
  if (subscription.status === "active") return subscription;
  if (subscription.status === "trialing" && session.payment_status === "no_payment_required") {
    return subscription;
  }
  return null;
}
