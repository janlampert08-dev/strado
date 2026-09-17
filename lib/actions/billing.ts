"use server";

// Abschluss, Bestätigung und Verwaltung des Premium-Abos. Aufgerufen aus
// components/PremiumCheckoutForm.tsx (Kauf), components/PremiumCard.tsx
// (Kundenportal) und app/profil/premium/page.tsx (Angebot).
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/siteUrl";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { isRateLimitedByKey } from "@/lib/rateLimit";
import {
  CHECKOUT_ANLEGEN_FENSTER_MS,
  CHECKOUT_ANLEGEN_LIMIT,
  CHECKOUT_BESTAETIGEN_FENSTER_MS,
  CHECKOUT_BESTAETIGEN_LIMIT,
} from "@/lib/abobremse";
import { KULANZ_TAGE, leseAboZustand, saisonpassPreisId } from "@/lib/stripeWebhook";
import {
  aktivesAboAusSession,
  checkoutIdempotencyKey,
  istEigeneBezahlteSession,
  istIdempotencyKonflikt,
  istUnbekannterCustomer,
  passendeOffeneSession,
  preisVonSession,
  saisonpassAusSession,
  type ZahlungsVariante,
} from "@/lib/stripeCheckout";
import { datumCH } from "@/lib/format";
import { saisonpassVerlaengerbar } from "@/lib/premiumAngebot";
import {
  SAISONPASS_MONATE,
  SAISONPASS_VERLAENGERBAR_TAGE_VOR_ABLAUF,
  TESTPHASE_TAGE,
  type AboPlan,
  type PlanAngebot,
  type PremiumAngebot,
  type VergebenerPreis,
} from "@/lib/premiumLimits";
import type Stripe from "stripe";

// Bremsen für die Aufrufe, die von hier aus bei Stripe landen.
//
// Jede Aktion in dieser Datei prüft die Berechtigung sauber — createCheckout
// gegen die eigene Session, confirmCheckoutSession zusätzlich gegen den
// eigenen Customer (istEigeneBezahlteSession). Ungeprüft war bisher nur die
// MENGE: ein angemeldetes Konto konnte diese Aktionen in einer Schleife
// aufrufen, und jeder Durchlauf kostet ein bis drei Stripe-Anfragen. Stripes
// Kontingent gilt fürs ganze Konto, nicht pro Nutzer — ein einzelnes Konto
// hätte damit die Bezahlseite für alle anderen ausbremsen können.
//
// Die Zahlen sind bewusst ungleich, und zwar nach dem, was ein Fehlalarm
// jeweils kostet:
//
//   Beim ANLEGEN (Checkout, Kundenportal) ist noch kein Geld geflossen. Wer
//   hier gebremst wird, sieht eine Meldung und klickt gleich noch einmal —
//   ärgerlich, mehr nicht.
//
//   Beim BESTÄTIGEN ist das Geld bereits abgebucht. Ein Fehlalarm hiesse:
//   bezahlt, aber kein Premium — der teuerste Fehler, den diese Datei machen
//   kann. Deshalb liegt das Limit dort um ein Vielfaches über dem
//   schlimmsten ehrlichen Fall.
//
// Die Zahlen selbst stehen in lib/abobremse.ts, zusammen mit dem
// Wiederhol-Takt, gegen den sie bemessen sind — eine "use server"-Datei darf
// keine Konstanten exportieren, und ohne Export gäbe es keinen Test. Genau
// den braucht die Abwägung oben: lib/abobremse.test.ts hält fest, dass der
// Abstand zwischen Takt und Limit erhalten bleibt.
//
// Wie überall in lib/rateLimit.ts: der Zähler lebt pro Serverless-Instanz
// und ist keine global konsistente Grenze, sondern die erste Hürde.

// Ein Customer-Feld kann bei Stripe die ID oder das ausgeklappte Objekt
// sein (auch ein gelöschter Customer). Nur die ID interessiert hier. Beide
// Trägertypen stehen im Union, weil sowohl ein Abo als auch eine
// Checkout-Session gegen den eigenen Customer geprüft wird.
function idVonCustomer(
  customer: Stripe.Subscription["customer"] | Stripe.Checkout.Session["customer"],
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

// Legt bei Bedarf einen Stripe-Customer an (einmalig pro Nutzer) und
// speichert die ID am Profil — sowohl der Webhook als auch die Bestätigung
// (unten) brauchen diese Zuordnung. Liest/schreibt stripe_customer_id über
// den Service-Role-Client statt der eingeloggten Nutzer-Session: die Spalte
// ist seit der RLS-Härtung (siehe Migration 0027) für anon/authenticated
// weder lesbar noch beschreibbar, da sie sonst über einen direkten PostgREST-
// Aufruf beliebig überschreibbar wäre. userId kommt hier ausschliesslich aus
// der bereits über supabase.auth.getUser() verifizierten Session der Aufrufer
// unten — nie aus Nutzereingaben — daher ist der RLS-Bypass hier sicher.
async function getOrCreateStripeCustomerId(
  userId: string,
  email: string | undefined,
): Promise<string> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await getStripe().customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });

  await admin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}

export type CheckoutSessionResult =
  | {
      ok: true;
      /** Initialisiert das Checkout-SDK im Browser (CheckoutElementsProvider).
       *  Gehört nicht in eine URL und nicht ins Log. */
      clientSecret: string;
      /** Wird nach der Zahlung an confirmCheckoutSession zurückgereicht. */
      sessionId: string;
      /** Der Preis, der für dieses Abo tatsächlich gilt — nicht der, den die
       *  Kaufseite beim Rendern gezeigt hat. Siehe VergebenerPreis. */
      preis: VergebenerPreis;
    }
  | { ok: false; error: string };

// AboPlan und die Angebots-Typen stehen in lib/premiumLimits.ts, nicht
// hier: eine Datei mit "use server" darf ausschliesslich async Functions
// exportieren. Eine exportierte Zahl lässt die
// Client-Reference-Transformation das Modul als "hat gar keine Exporte"
// behandeln, und der Build bricht mit einer Meldung ab, die auf den
// Importeur statt auf die Ursache zeigt. Dieselbe Falle steht in
// lib/constants.ts für REPORT_REASONS beschrieben.

// Welche Umgebungsvariable einen Plan trägt. Der Name wird mitgeführt, weil
// betrag() unten ihn in die Fehlermeldung schreibt — "Preis fehlt" ohne die
// Variable ist genau die Meldung, die niemand nachschlagen kann.
function monatsPreis(): { variable: string; preisId: string | undefined } {
  // Fallback auf die alte, einzelne Variable, damit bestehende
  // .env.local-Dateien ohne Anpassung weiterlaufen.
  if (process.env.STRIPE_PREMIUM_PRICE_ID_MONAT) {
    return { variable: "STRIPE_PREMIUM_PRICE_ID_MONAT", preisId: process.env.STRIPE_PREMIUM_PRICE_ID_MONAT };
  }
  return { variable: "STRIPE_PREMIUM_PRICE_ID", preisId: process.env.STRIPE_PREMIUM_PRICE_ID };
}

function jahresPreis(): { variable: string; preisId: string | undefined } {
  return { variable: "STRIPE_PREMIUM_PRICE_ID_JAHR", preisId: process.env.STRIPE_PREMIUM_PRICE_ID_JAHR };
}

// Seit 0110. Kein Abo-Preis, sondern ein einmaliger — und deshalb bewusst
// nicht in bekanntePreisIds() (lib/stripeWebhook.ts).
function passPreis(): { variable: string; preisId: string | undefined } {
  return { variable: "STRIPE_PREMIUM_PRICE_ID_SAISONPASS", preisId: saisonpassPreisId() };
}

function preisQuelle(plan: AboPlan): { variable: string; preisId: string | undefined } {
  switch (plan) {
    case "monat":
      return monatsPreis();
    case "jahr":
      return jahresPreis();
    case "saisonpass":
      return passPreis();
  }
}

// Preis-IDs kommen ausschliesslich aus dieser serverseitigen Zuordnung. Eine
// vom Client übergebene Price-ID würde bedeuten, dass sich jeder seinen
// eigenen Preis aussuchen kann — auch einen fremden oder einen aus einem
// anderen Katalog.
//
// Bis 2026-09-07 hat der Jahresplan hier einen Gründerplatz reserviert
// (Migrationen 0065–0069). Der Gründerpreis wird nicht mehr verkauft; die
// Funktionen bleiben in der Datenbank als Bestand, werden aber nicht mehr
// aufgerufen. Bestehende Gründer-Abos laufen bei Stripe unter ihrer alten
// Preis-ID weiter und brauchen von hier nichts.
function preisIdFuer(plan: AboPlan): string | undefined {
  return preisQuelle(plan).preisId;
}

// Preise kommen aus Stripe, nicht aus einer zweiten Liste im Code — eine im
// Dashboard geänderte Zahl darf nicht stillschweigend von einer
// hartcodierten abweichen, sonst bewirbt die Seite einen Preis, der beim
// Abbuchen ein anderer ist (Preisbekanntgabeverordnung und, schlichter,
// Vertrauen).
//
// null heisst "diesen Plan nicht anbieten" — die Kaufseite lässt ihn dann
// weg und funktioniert mit dem Rest. Das bleibt so, aber nicht mehr still:
// bis hierhin schluckte diese Funktion jeden Fehler, und der Monatsplan
// verschwand tagelang von der Kaufseite, ohne dass irgendwo stand, warum
// (eine fehlende Variable sieht von aussen genauso aus wie ein Stripe-
// Ausfall). Jetzt steht die Ursache samt Variablenname im Log.
async function betrag(
  quelle: { variable: string; preisId: string | undefined },
): Promise<{ rappen: number; waehrung: string } | null> {
  const { variable, preisId } = quelle;
  if (!preisId) {
    console.warn(`Premium-Preis nicht konfiguriert: ${variable} ist leer — Plan wird nicht angeboten`);
    return null;
  }
  try {
    const preis = await getStripe().prices.retrieve(preisId);
    if (typeof preis.unit_amount !== "number") {
      console.error("Premium-Preis konnte nicht geladen werden", { variable, preisId }, "unit_amount fehlt");
      return null;
    }
    return { rappen: preis.unit_amount, waehrung: preis.currency };
  } catch (err) {
    console.error("Premium-Preis konnte nicht geladen werden", { variable, preisId }, err);
    return null;
  }
}

// Was die Datenbank über bisherige und laufende Zugänge dieser Person weiss.
//
// Über den Service-Role-Client, weil subscriptions/saisonpaesse ihre
// Stripe-Spalten für authenticated sperren (0063, 0110) — gelesen werden
// hier aber nur Status und Zeiträume, und userId stammt ausschliesslich aus
// der verifizierten Session der Aufrufer unten (Muster b in AGENTS.md,
// Supabase Rules).
async function zugangsgeschichte(userId: string): Promise<{
  hatteAbo: boolean;
  hatteSaisonpass: boolean;
  passBis: Date | null;
}> {
  const admin = createAdminClient();
  const jetzt = new Date().toISOString();
  const [{ count: abos }, { data: paesse }] = await Promise.all([
    admin.from("subscriptions").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    admin
      .from("saisonpaesse")
      .select("gueltig_bis, erstattet_am")
      .eq("user_id", userId)
      .order("gueltig_bis", { ascending: false })
      .limit(20),
  ]);

  const laufend = (paesse ?? []).find((p) => p.erstattet_am === null && p.gueltig_bis > jetzt);
  return {
    hatteAbo: (abos ?? 0) > 0,
    hatteSaisonpass: (paesse ?? []).length > 0,
    passBis: laufend ? new Date(laufend.gueltig_bis) : null,
  };
}

// Nur lesend — die Kaufseite darf beliebig oft geöffnet werden, ohne dass
// bei Stripe etwas entsteht; eine Checkout-Session entsteht erst in
// createCheckoutSession.
//
// Seit 0110 hängt das Angebot an der Person: ob die Testphase angezeigt wird
// und ob ein laufender Saisonpass das Abo erst später zahlen lässt. Beides
// ist nur Anzeige — entschieden wird in checkoutSessionMitCustomer, und dort
// zusätzlich gegen Stripe.
export async function getPremiumAngebot(): Promise<PremiumAngebot> {
  const user = await getCurrentUser();
  const [monat, jahr, pass, geschichte] = await Promise.all([
    betrag(monatsPreis()),
    betrag(jahresPreis()),
    betrag(passPreis()),
    user ? zugangsgeschichte(user.id) : Promise.resolve(null),
  ]);

  const plaene: PlanAngebot[] = [];
  if (monat) plaene.push({ plan: "monat", betragRappen: monat.rappen, waehrung: monat.waehrung });
  if (jahr) plaene.push({ plan: "jahr", betragRappen: jahr.rappen, waehrung: jahr.waehrung });
  if (pass) plaene.push({ plan: "saisonpass", betragRappen: pass.rappen, waehrung: pass.waehrung });

  // Ein fehlender Plan ist auf der Seite unsichtbar — dort stehen dann nur
  // die anderen, und das sieht aus wie Absicht. Hier steht, welcher fehlt.
  if (!monat) console.warn("Premium-Angebot ohne Monatsplan");
  if (!jahr) console.warn("Premium-Angebot ohne Jahresplan");
  if (!pass) console.warn("Premium-Angebot ohne Saisonpass");

  return {
    plaene,
    testphaseMoeglich:
      geschichte !== null &&
      !geschichte.hatteAbo &&
      !geschichte.hatteSaisonpass &&
      geschichte.passBis === null,
    saisonpassBis: geschichte?.passBis?.toISOString() ?? null,
  };
}

// Stripe verlangt für trial_end mindestens 48 Stunden Abstand. Endet ein Pass
// früher, bekommt das Abo kein aufgeschobenes Startdatum mehr: es zahlt
// sofort, und die paar Stunden Überlappung sind der ehrlichere Preis als eine
// Zahlungsverschiebung, die Stripe ablehnt.
const ANSCHLUSS_MINDESTABSTAND_MS = 48 * 60 * 60 * 1000;

interface SessionPlanung {
  variante: ZahlungsVariante;
  /** Unix-Sekunden, nur bei "anschluss". */
  trialEnde?: number;
  /** Wann die erste Zahlung fällig wird, wenn nicht heute. */
  faelligAm?: Date;
}

// Welche Art Session diese Person für diesen Plan bekommt.
//
// Die Testphase gibt es einmal pro Konto, und "Konto" heisst hier zweierlei:
// die Datenbank (hatte je ein Abo oder einen Pass) UND Stripe (hatte dieser
// Customer je ein Abo, in welchem Zustand auch immer). Die Datenbank allein
// genügt nicht, weil eine Abo-Zeile nach einem Moduswechsel oder einer
// Bereinigung fehlen kann; Stripe allein genügt nicht, weil ein Saisonpass
// dort kein Abo ist.
async function planeSession(
  plan: AboPlan,
  customerId: string,
  geschichte: Awaited<ReturnType<typeof zugangsgeschichte>>,
): Promise<SessionPlanung> {
  if (plan === "saisonpass") return { variante: "sofort" };

  const jetzt = Date.now();
  if (geschichte.passBis && geschichte.passBis.getTime() - jetzt > ANSCHLUSS_MINDESTABSTAND_MS) {
    return {
      variante: "anschluss",
      trialEnde: Math.floor(geschichte.passBis.getTime() / 1000),
      faelligAm: geschichte.passBis,
    };
  }

  if (plan !== "jahr" || geschichte.hatteAbo || geschichte.hatteSaisonpass) {
    return { variante: "sofort" };
  }

  const frueher = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 1,
  });
  if (frueher.data.length > 0) return { variante: "sofort" };

  return {
    variante: "testphase",
    faelligAm: new Date(jetzt + TESTPHASE_TAGE * 24 * 60 * 60 * 1000),
  };
}

// Der Preis, der auf der Schaltfläche steht: was heute fällig wird und —
// falls die erste Zahlung später kommt — wie viel dann und ab wann.
async function vergebenerPreis(
  session: Stripe.Checkout.Session,
  plan: AboPlan,
  planung: SessionPlanung,
): Promise<VergebenerPreis | null> {
  const heute = preisVonSession(session);
  const katalog = await betrag(preisQuelle(plan));

  // Rückfall auf den Katalogpreis, falls die Session keinen Gesamtbetrag
  // trägt. Abgebrochen wird erst, wenn auch der fehlt: lieber gar kein Kauf
  // als ein Kauf zum falsch ausgezeichneten Preis.
  const basis =
    heute ?? (katalog ? { betragRappen: katalog.rappen, waehrung: katalog.waehrung } : null);
  if (!basis) return null;

  if (planung.variante === "sofort" || !planung.faelligAm) return basis;

  // Bei Testphase und Anschluss ist amount_total 0; der spätere Betrag kommt
  // deshalb aus dem Katalog. Fehlt der, gibt es keinen ehrlichen Satz für die
  // Schaltfläche — und dann keinen Kauf.
  if (!katalog) return null;
  return {
    betragRappen: basis.betragRappen,
    waehrung: basis.waehrung,
    spaeter: {
      abRappen: katalog.rappen,
      faelligAm: planung.faelligAm.toISOString(),
      grund: planung.variante,
    },
  };
}

// Legt eine Checkout-Session im Modus "elements" an und gibt deren
// Client-Secret zurück. Damit initialisiert der Browser das Checkout-SDK
// (components/PremiumCheckoutForm.tsx), rendert das Payment Element
// eingebettet im eigenen UI und bestätigt über checkout.confirm() — ohne
// Umleitung auf Stripes gehostete Seite.
//
// Der frühere Weg legte hier selbst ein Abo mit payment_behavior:
// "default_incomplete" an und reichte das PaymentIntent-Client-Secret der
// ersten Rechnung durch. Die Checkout Sessions API übernimmt genau diesen
// Aufbau: das Abo entsteht erst, wenn die Session bezahlt ist, und Stripe
// verwaltet Rechnung, Zahlungsarten und Wiederaufnahme selbst.
//
// Der Saisonpass (0110) läuft durch dieselbe Funktion, aber im Modus
// "payment": eine Einmalzahlung, kein Abo. Was danach passiert, ist der
// eigentliche Unterschied — es entsteht kein Abo-Objekt, das Stripe pflegt,
// sondern eine Zeile in saisonpaesse mit Anfang und Ende.
//
// Ausgelagert aus createCheckoutSession, damit sich der Aufbau nach einem
// unbekannten Customer unten einmal mit einer frischen ID wiederholen lässt,
// ohne die Prüfungen am Anfang der Funktion (Anmeldung, Plan, Preis-ID) ein
// zweites Mal zu durchlaufen.
async function checkoutSessionMitCustomer(
  userId: string,
  email: string | undefined,
  plan: AboPlan,
  preisId: string,
  /** Erzwingt einen frischen Idempotency-Key, wenn der reguläre bei Stripe
   *  mit abweichenden Parametern verbrannt ist — siehe unten. */
  schluesselZusatz?: string,
): Promise<CheckoutSessionResult> {
  const customerId = await getOrCreateStripeCustomerId(userId, email);

  // Ohne diese Prüfung legte jeder Aufruf eine neue Session an: wer die
  // Kaufseite zweimal öffnet oder neu lädt, erzeugte zwei offene Sessions —
  // und wer beide bezahlt, zahlt doppelt für dasselbe Konto.
  //
  // Gezielt nach Status abfragen statt status "all" mit einer Seitengrenze:
  // ein Konto mit vielen beendeten Abos hätte sonst genau das laufende aus
  // der ersten Seite verdrängt, und daneben wäre ein zweites entstanden.
  const [aktive, testphase, offeneSessions, geschichte] = await Promise.all([
    getStripe().subscriptions.list({ customer: customerId, status: "active", limit: 1 }),
    getStripe().subscriptions.list({ customer: customerId, status: "trialing", limit: 1 }),
    getStripe().checkout.sessions.list({ customer: customerId, status: "open", limit: 20 }),
    zugangsgeschichte(userId),
  ]);

  if (aktive.data.length > 0 || testphase.data.length > 0) {
    return { ok: false, error: "Du hast bereits ein aktives Premium-Abo." };
  }

  // Ein zweiter Pass mitten in der Saison ist fast sicher ein Versehen —
  // angerechnet würde er (apply_saisonpass hängt ihn hinten an), aber
  // gewollt ist er selten. Der Satz nennt, ab wann es geht, statt bloss
  // "nicht möglich" zu sagen.
  if (plan === "saisonpass" && geschichte.passBis && !saisonpassVerlaengerbar(geschichte.passBis)) {
    return {
      ok: false,
      error:
        `Dein Saisonpass gilt noch bis ${datumCH(geschichte.passBis)}. Verlängern kannst du ihn ` +
        `in den letzten ${SAISONPASS_VERLAENGERBAR_TAGE_VOR_ABLAUF} Tagen davor.`,
    };
  }

  const planung = await planeSession(plan, customerId, geschichte);
  const modus = plan === "saisonpass" ? "payment" : "subscription";

  // Eine noch offene Session für denselben Preis UND dieselbe Zahlungsart
  // wiederverwenden, statt daneben eine zweite anzulegen — siehe
  // passendeOffeneSession.
  const offen = passendeOffeneSession(offeneSessions.data, preisId, {
    modus,
    variante: planung.variante,
  });
  if (offen) {
    const offenerPreis = await vergebenerPreis(offen, plan, planung);
    if (offenerPreis) {
      return {
        ok: true,
        clientSecret: offen.client_secret!,
        sessionId: offen.id,
        preis: offenerPreis,
      };
    }
  }

  // Die Metadaten sind die einzige Stelle, an der später steht, was diese
  // Session war: lib/stripeCheckout.ts liest plan und variante daraus, und
  // beide entscheiden mit, ob eine Session ohne Zahlung als Erfolg gilt.
  // Deshalb werden sie hier serverseitig gesetzt und nirgends aus dem
  // Browser übernommen.
  const metadata = {
    supabase_user_id: userId,
    plan,
    price_id: preisId,
    variante: planung.variante,
  };

  const gemeinsam = {
    // "elements" statt "hosted_page": das Payment Element sammelt die
    // Zahlungsdaten eingebettet im eigenen UI. Für diesen Modus ist
    // return_url Pflicht.
    ui_mode: "elements" as const,
    // Managed Payments (Stripes eigene Merchant-of-Record-Lösung) ist auf
    // neuen Live-Konten standardmässig an und lässt in diesem Zustand nur
    // ui_mode "hosted_page"/"embedded_page" zu — ui_mode "elements" schlägt
    // dann mit "Invalid ui_mode: elements" fehl. Das eigene, gestylte
    // Payment Element (Appearance, Dunkelmodus, TWINT, die AGB direkt im
    // UI) ist bewusst gebaut und keine Stripe-Merchant-of-Record-Abwicklung
    // — deshalb hier ausdrücklich abgewählt statt im Dashboard global
    // umzustellen.
    managed_payments: { enabled: false },
    customer: customerId,
    line_items: [{ price: preisId, quantity: 1 }],
    // Rückweg für Zahlungsarten mit Weiterleitung (TWINT, Bankverfahren).
    // {CHECKOUT_SESSION_ID} ersetzt Stripe beim Umleiten durch die ID
    // dieser Session — die Abschluss-Seite braucht sie, um den Zustand
    // nachzuprüfen.
    return_url: `${siteUrl()}/profil/premium/abschluss?sitzung={CHECKOUT_SESSION_ID}`,
    metadata,
  };

  const parameter: Stripe.Checkout.SessionCreateParams =
    modus === "payment"
      ? {
          ...gemeinsam,
          mode: "payment",
          // Eine Rechnung wie beim Abo. Ohne sie gäbe es zum Saisonpass nur
          // eine Zahlungsbestätigung per E-Mail und im Kundenportal nichts
          // zum Herunterladen — für eine Einmalzahlung von CHF 29 ist das
          // der Unterschied zwischen Beleg und Erinnerung.
          invoice_creation: { enabled: true, invoice_data: { metadata } },
          payment_intent_data: { metadata },
        }
      : {
          ...gemeinsam,
          mode: "subscription",
          subscription_data: {
            metadata,
            ...(planung.variante === "testphase" ? { trial_period_days: TESTPHASE_TAGE } : {}),
            ...(planung.variante === "anschluss" && planung.trialEnde
              ? { trial_end: planung.trialEnde }
              : {}),
          },
          // Auch wenn heute nichts abgebucht wird, wird ein Zahlungsmittel
          // verlangt. Sonst endete die Testphase in einem Abo, das nicht
          // abbuchen kann — und die zahlende Person erführe davon zuerst
          // durch eine Mahnung.
          payment_method_collection: "always" as const,
        };

  const session = await getStripe().checkout.sessions.create(parameter, {
    // Fängt den Doppelklick ab, bei dem zwei Anfragen die Prüfung oben
    // gleichzeitig passieren: beide bekommen dann dieselbe Session zurück.
    // Der Schlüssel trägt Customer, Preis-ID und Zahlungsart mit, damit ein
    // geänderter Aufruf auch einen geänderten Schlüssel bekommt — siehe
    // checkoutIdempotencyKey.
    idempotencyKey: checkoutIdempotencyKey({
      userId,
      plan: `${plan}:${planung.variante}${planung.trialEnde ? `:${planung.trialEnde}` : ""}`,
      customerId,
      preisId,
      zusatz: schluesselZusatz,
    }),
  });

  const clientSecret = session.client_secret;
  if (!clientSecret) {
    return { ok: false, error: "Zahlung konnte nicht vorbereitet werden." };
  }

  const preis = await vergebenerPreis(session, plan, planung);
  if (!preis) {
    console.error("Checkout-Session ohne Betrag", { sessionId: session.id, plan });
    return { ok: false, error: "Dieser Plan ist zurzeit nicht verfügbar." };
  }
  return { ok: true, clientSecret, sessionId: session.id, preis };
}

// Legt eine Checkout-Session an (siehe checkoutSessionMitCustomer). Aufrufer
// von components/PremiumCheckoutForm.tsx.
//
// Ohne dieses Netz liess jede Stripe-Ausnahme — Netzstörung, unbekannter
// Customer, alles — die Server Action einfach werfen: die Anfrage im Browser
// blieb dann für immer im Ladezustand hängen ("Zahlung wird
// vorbereitet…"), weil kein Ergebnis je zurückkam, mit dem die Oberfläche
// einen Fehler hätte anzeigen können.
export async function createCheckoutSession(
  plan: AboPlan = "monat",
): Promise<CheckoutSessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Bitte melde dich zuerst an." };

  // Vor dem ersten Stripe-Aufruf: checkoutSessionMitCustomer() unten fragt
  // drei Listen bei Stripe ab, bevor es überhaupt zu einer Entscheidung
  // kommt. Nach der Anmeldeprüfung, damit ein abgemeldeter Aufruf keinen
  // fremden Zähler füllt.
  if (
    isRateLimitedByKey(`checkout:anlegen:${user.id}`, CHECKOUT_ANLEGEN_LIMIT, CHECKOUT_ANLEGEN_FENSTER_MS)
  ) {
    return { ok: false, error: "Zu viele Versuche. Bitte warte einen Moment." };
  }

  // Nur die bekannten Werte. Kommt etwas anderes an, ist es keine Auswahl
  // aus der Oberfläche, sondern ein selbst gebauter Aufruf.
  if (plan !== "monat" && plan !== "jahr" && plan !== "saisonpass") {
    return { ok: false, error: "Unbekannter Plan." };
  }

  const preisId = preisIdFuer(plan);
  if (!preisId) return { ok: false, error: "Dieser Plan ist zurzeit nicht verfügbar." };

  try {
    return await checkoutSessionMitCustomer(user.id, user.email, plan, preisId);
  } catch (err) {
    // Derselbe Idempotency-Key liegt bei Stripe mit anderen Parametern —
    // etwa weil ein Deploy die Session-Parameter erweitert hat, während im
    // selben Stundenraster noch ein Key aus der Vorversion verbrannt ist.
    // Ohne diesen Zweig wäre der Kauf für dieses Konto bis zum Stundenwechsel
    // gesperrt; mit ihm läuft der zweite Versuch auf einem frischen Key.
    //
    // Kein Risiko einer Doppelbuchung: der Konflikt sagt gerade, dass unter
    // diesem Key nie eine Session mit diesen Parametern entstanden ist, und
    // der zweite Versuch durchläuft die Prüfung auf aktives Abo und offene
    // Session erneut.
    if (istIdempotencyKonflikt(err)) {
      console.warn("Idempotency-Key verbrannt, neuer Versuch mit frischem Schlüssel", {
        userId: user.id,
        plan,
      });
      try {
        return await checkoutSessionMitCustomer(
          user.id,
          user.email,
          plan,
          preisId,
          randomUUID(),
        );
      } catch (err2) {
        console.error(
          "Checkout-Session konnte auch mit frischem Idempotency-Key nicht angelegt werden",
          { userId: user.id, plan },
          err2,
        );
        return {
          ok: false,
          error: "Zahlung konnte gerade nicht vorbereitet werden. Bitte versuch es in ein paar Minuten noch einmal.",
        };
      }
    }

    if (!istUnbekannterCustomer(err)) {
      console.error("Checkout-Session konnte nicht angelegt werden", { userId: user.id, plan }, err);
      return {
        ok: false,
        error: "Zahlung konnte gerade nicht vorbereitet werden. Bitte versuch es in ein paar Minuten noch einmal.",
      };
    }

    // profiles.stripe_customer_id zeigt auf eine ID, die es unter dem
    // aktuell verwendeten Schlüssel nicht gibt — typischerweise ein
    // Test/Live-Moduswechsel, bei dem die gespeicherte ID aus dem jeweils
    // anderen Modus stammt. Verworfen und einmal neu versucht, statt den
    // Kauf für dieses Konto dauerhaft an einer toten ID scheitern zu lassen.
    console.warn("Stripe-Customer nicht gefunden, wird neu angelegt", { userId: user.id });
    await createAdminClient().from("profiles").update({ stripe_customer_id: null }).eq("id", user.id);

    try {
      return await checkoutSessionMitCustomer(user.id, user.email, plan, preisId);
    } catch (err2) {
      console.error(
        "Checkout-Session konnte auch nach Neuanlage des Customers nicht angelegt werden",
        { userId: user.id, plan },
        err2,
      );
      return {
        ok: false,
        error: "Zahlung konnte gerade nicht vorbereitet werden. Bitte versuch es in ein paar Minuten noch einmal.",
      };
    }
  }
}

// Schreibt den Abo-Zustand aus einem bereits bei Stripe verifizierten Abo in
// die Datenbank. Gemeinsamer Schluss beider Bestätigungswege unten.
//
// Beide Zustände gemeinsam schreiben. Früher setzte diese Stelle nur
// profiles.ist_premium — Premium war damit sofort aktiv, während es zu dem
// Abo keine Zeile in subscriptions gab und die Anwendung weder Plan noch
// Periodenende noch Kulanzfrist kannte. apply_subscription_state erledigt
// beides in einer Transaktion (0059_premium_abo_zustand.sql).
async function schreibeAboZustand(
  admin: ReturnType<typeof createAdminClient>,
  subscription: Stripe.Subscription,
  abgerufenAm: string,
): Promise<boolean> {
  const zustand = leseAboZustand(subscription);
  if (!zustand) return false;

  const { data: angewendet, error } = await admin.rpc("apply_subscription_state", {
    p_stripe_customer_id: zustand.stripeCustomerId,
    p_stripe_subscription_id: zustand.stripeSubscriptionId,
    p_status: zustand.status,
    p_price_id: zustand.priceId,
    p_current_period_end: zustand.currentPeriodEnd,
    p_cancel_at_period_end: zustand.cancelAtPeriodEnd,
    p_stripe_fetched_at: abgerufenAm,
    p_kulanz_aktion: "unveraendert",
    p_kulanz_invoice_id: null,
    p_kulanz_tage: KULANZ_TAGE,
  });

  if (error) return false;

  // false heisst hier: der Webhook war schneller und hat bereits einen
  // neueren Zustand geschrieben. Das Abo ist bezahlt und verifiziert, der
  // Kauf gilt also trotzdem als erfolgreich.
  if (angewendet !== false) {
    // revalidatePath ist eine Mutation und darf laut Next.js ausschliesslich
    // aus einer Server Action oder einem Route Handler kommen, niemals aus
    // einem Render. Kommt sie doch aus einem Render, wirft sie — und bei
    // einer Seite heisst das: Fehlerseite statt Inhalt. Genau so ist der
    // Abschluss am 2026-09-08 gescheitert, weil die Abschluss-Seite die
    // Bestätigung im Render aufrief (behoben: sie läuft jetzt über
    // components/AboBestaetigung.tsx).
    //
    // Die richtige Antwort darauf ist der Aufrufer, nicht dieses try — die
    // Cache-Auffrischung ist aber Komfort und nie Korrektheit: der
    // Abo-Zustand steht zu diesem Zeitpunkt bereits in der Datenbank.
    // Deshalb darf ein falsch platzierter Aufruf hier höchstens die
    // Auffrischung kosten und nicht die Seite, auf der jemand gerade
    // bezahlt hat.
    try {
      revalidatePath("/profil");
      revalidatePath("/profil/einstellungen");
    } catch (err) {
      console.error(
        "Abo-Zustand geschrieben, aber revalidatePath fehlgeschlagen — " +
          "wird die Bestätigung aus einem Render aufgerufen?",
        err,
      );
    }
  }
  return true;
}

// Nach erfolgreicher Bestätigung im Browser (checkout.confirm, ohne
// Weiterleitung) oder nach der Rückkehr von einer Weiterleitungs-Zahlungsart
// wird der Zustand direkt bei Stripe verifiziert, statt sich allein auf das
// Webhook-Event zu verlassen — das funktioniert unabhängig davon, ob Stripe
// diese Umgebung per Webhook erreichen kann.
export async function confirmCheckoutSession(sessionId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // sessionId kommt aus dem Browser, und stripe.checkout.sessions.retrieve()
  // unten läuft, BEVOR istEigeneBezahlteSession() die Zugehörigkeit prüft —
  // das muss so sein, denn ohne die abgerufene Session gibt es nichts zu
  // prüfen. Ohne Bremse hiesse das: beliebig viele Stripe-Abrufe mit
  // beliebigen IDs. Das Limit ist grosszügig bemessen, Begründung oben bei
  // CHECKOUT_BESTAETIGEN_LIMIT.
  if (
    isRateLimitedByKey(
      `checkout:bestaetigen:${user.id}`,
      CHECKOUT_BESTAETIGEN_LIMIT,
      CHECKOUT_BESTAETIGEN_FENSTER_MS,
    )
  ) {
    console.warn("Abo-Bestätigung gebremst", { userId: user.id });
    return false;
  }

  // Wie oben: stripe_customer_id/ist_premium sind für anon/authenticated
  // weder lesbar noch beschreibbar (Migration 0027) — der Service-Role-Client
  // ist hier sicher, weil user.id aus der bereits verifizierten Session
  // stammt und der Premium-Status erst nach der Stripe-Verifikation unten
  // gesetzt wird, nicht anhand von Client-Eingaben.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) return false;

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
  } catch {
    return false;
  }
  const abgerufenAm = new Date().toISOString();

  // Der Saisonpass zuerst, weil er kein Abo ist: Modus "payment", kein
  // Abo-Objekt, und der Zugang entsteht aus einem Zeitraum statt aus einem
  // Stripe-Status. Die Bindung an den eigenen Customer ist dieselbe wie
  // unten und aus demselben Grund unverzichtbar — die Session-ID kommt aus
  // der Adresszeile.
  const pass = saisonpassAusSession(session, profile.stripe_customer_id);
  if (pass) {
    const { error } = await admin.rpc("apply_saisonpass", {
      p_stripe_customer_id: pass.customerId,
      p_stripe_checkout_session_id: pass.sessionId,
      p_stripe_payment_intent_id: pass.paymentIntentId,
      p_price_id: pass.preisId,
      p_betrag_rappen: pass.betragRappen,
      p_waehrung: pass.waehrung,
      p_monate: SAISONPASS_MONATE,
    });

    if (error) {
      console.error("Saisonpass konnte nicht eingetragen werden", { sessionId: pass.sessionId }, error);
      return false;
    }

    // Wie beim Abo: die Auffrischung ist Komfort, der Zustand steht bereits
    // in der Datenbank. Ein falsch platzierter Aufruf (aus einem Render)
    // darf deshalb höchstens sie kosten und nicht die Seite, auf der gerade
    // bezahlt wurde.
    try {
      revalidatePath("/profil");
      revalidatePath("/profil/einstellungen");
    } catch (err) {
      console.error("Saisonpass eingetragen, aber revalidatePath fehlgeschlagen", err);
    }
    return true;
  }

  // Die Session muss dem eigenen Customer gehören und tatsächlich bezahlt
  // sein: sessionId kommt aus dem Browser bzw. aus der Adresszeile, ist also
  // eine Nutzereingabe. Ohne diese Prüfung liesse sich mit einer fremden
  // Session-ID Premium für das eigene Konto einschalten. Begründung der
  // einzelnen Bedingungen in lib/stripeCheckout.ts.
  if (!istEigeneBezahlteSession(session, profile.stripe_customer_id)) return false;

  const subscription = aktivesAboAusSession(session);
  if (!subscription) return false;

  return schreibeAboZustand(admin, subscription, abgerufenAm);
}

// Übergangsweg aus dem vorherigen Payment-Intent-Fluss.
//
// Bis zur Umstellung auf die Checkout Sessions API zeigte die return_url auf
// /profil/premium/abschluss?abo=<Abo-ID>. Wer eine Weiterleitungs-Zahlung
// (TWINT, Bankverfahren) begonnen hat, bevor diese Fassung ausgeliefert
// wurde, kehrt danach mit genau dieser Adresse zurück — dann ist das hier
// der einzige Weg, seine bereits erfolgte Zahlung zu bestätigen. Ohne diesen
// Zweig stünde er vor einer Seite, die seine Zahlung nicht kennt.
//
// Entfernen, sobald keine solche Weiterleitung mehr unterwegs sein kann;
// Stripe lässt eine begonnene Zahlung höchstens wenige Tage offen.
export async function confirmSubscription(subscriptionId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // Derselbe Zähler wie confirmCheckoutSession, nicht ein zweiter daneben:
  // AboBestaetigung.tsx ruft je Durchlauf genau eine der beiden auf (Session
  // ODER Abo-ID), und beide kosten denselben Stripe-Abruf. Zwei getrennte
  // Zähler hiessen in der Summe das doppelte Kontingent für dieselbe Sache.
  if (
    isRateLimitedByKey(
      `checkout:bestaetigen:${user.id}`,
      CHECKOUT_BESTAETIGEN_LIMIT,
      CHECKOUT_BESTAETIGEN_FENSTER_MS,
    )
  ) {
    console.warn("Abo-Bestätigung gebremst", { userId: user.id });
    return false;
  }

  // Wie oben: stripe_customer_id/ist_premium sind für anon/authenticated
  // weder lesbar noch beschreibbar (Migration 0027) — der Service-Role-Client
  // ist hier sicher, weil user.id aus der bereits verifizierten Session
  // stammt und der Premium-Status erst nach der Stripe-Verifikation unten
  // gesetzt wird, nicht anhand von Client-Eingaben.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) return false;

  let subscription: Stripe.Subscription;
  try {
    subscription = await getStripe().subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice"],
    });
  } catch {
    return false;
  }
  const abgerufenAm = new Date().toISOString();

  // Kein Gratis-Testzeitraum konfiguriert — "trialing" hier bewusst NICHT
  // akzeptiert (im Gegensatz zum Webhook-Handler, der auch künftige
  // Trial-Konfigurationen abdecken soll). "active" allein reicht aus, aber
  // zusätzlich prüfen wir, dass die zugehörige Rechnung tatsächlich bezahlt
  // wurde, statt uns allein auf das Subscription-Status-Feld zu verlassen.
  if (subscription.status !== "active") return false;
  // Das Abo muss dem eigenen Customer gehören: subscriptionId kommt aus dem
  // Browser, ist also eine Nutzereingabe. Ohne diese Prüfung liesse sich mit
  // einer fremden Abo-ID Premium für das eigene Konto einschalten.
  if (idVonCustomer(subscription.customer) !== profile.stripe_customer_id) return false;

  const invoice = subscription.latest_invoice;
  const invoicePaid = invoice && typeof invoice === "object" && invoice.status === "paid";
  if (!invoicePaid) return false;

  return schreibeAboZustand(admin, subscription, abgerufenAm);
}

// Stripes gehostetes Kundenportal — dort verwaltet/kündigt der Nutzer sein
// Abo selbst, keine eigene UI dafür nötig (im Gegensatz zum Checkout selbst
// lohnt sich der Aufwand einer eigenen Portal-Nachbildung nicht).
export async function createPortalSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/anmelden");

  // Auch hier steht am Ende ein Stripe-Aufruf. Gebremst wird auf /profil
  // zurückgeschickt statt mit einer Fehlerseite: die Funktion antwortet
  // ausschliesslich mit redirect(), und auf /profil steht der Knopf, der
  // hierher führt — der zweite Versuch ist also einen Klick entfernt.
  if (
    isRateLimitedByKey(`portal:${user.id}`, CHECKOUT_ANLEGEN_LIMIT, CHECKOUT_ANLEGEN_FENSTER_MS)
  ) {
    redirect("/profil");
  }

  // Wie oben: stripe_customer_id ist für anon/authenticated nicht mehr lesbar
  // (Migration 0027).
  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) redirect("/profil");

  const session = await getStripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${siteUrl()}/profil`,
  });

  redirect(session.url);
}

// Kürzt eine Nutzereingabe fürs Log auf eine Zeile: Steuerzeichen raus,
// damit sich nichts einschmuggeln kann, das im Log wie ein eigener Eintrag
// aussieht, und auf maxLaenge beschnitten.
function einzeilig(wert: unknown, maxLaenge: number): string {
  if (typeof wert !== "string") return "";
  return wert.replace(/[\u0000-\u001F\u007F]+/g, " ").slice(0, maxLaenge);
}

// Meldet ein im Browser aufgetretenes Problem des Bezahlformulars ins
// Server-Log — und damit in Vercels Runtime-Logs.
//
// Der Grund: checkout.confirm() läuft vollständig im Browser. Wirft es —
// weil eine Fremd-Origin von der CSP blockiert wird, weil Stripe.js in
// einen unerwarteten Zustand gerät, weil die Verbindung abreisst — dann
// sieht die zahlende Person "Die Zahlung liess sich gerade nicht
// bestätigen", und sonst erfährt es niemand: eine Fehlerberichterstattung
// gibt es nicht (kein Sentry, siehe AGENTS.md), im Server-Log steht nichts,
// weil nie eine Anfrage ankam, und ein CSP-Verstoss landet ohnehin nur in
// der Browser-Konsole der zahlenden Person. Genau diese Blindheit hat den
// Live-Kauf zweimal hintereinander auf Verdacht debuggen lassen.
//
// Bewusst schmal: liest nichts, schreibt nichts, gibt nichts zurück, und
// die Oberfläche wartet nicht darauf. Eine angemeldete Sitzung ist Pflicht,
// damit das hier kein offener Log-Eingang ist.
export async function meldeCheckoutProblem(
  sitzungId: string,
  phase: "vorbereitung" | "confirm" | "bestaetigung",
  meldung: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  console.error("Bezahlformular: Fehler im Browser", {
    userId: user.id,
    // phase kommt wie alles andere aus dem Browser — auf die drei bekannten
    // Werte festnageln statt durchreichen.
    phase: phase === "confirm" || phase === "bestaetigung" ? phase : "vorbereitung",
    sitzungId: einzeilig(sitzungId, 80),
    meldung: einzeilig(meldung, 300),
  });
}
