"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripeClient";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Skeleton from "@/components/ui/Skeleton";
import { createSubscriptionIntent, confirmSubscription } from "@/lib/actions/billing";
import { isDarkTheme, subscribeToThemeChange } from "@/lib/theme";
import { LEGAL_URLS } from "@/lib/constants";
import {
  betragText,
  planTitel,
  planZeitraum,
  verlaengerungsZeitraum,
} from "@/lib/premiumAngebot";
import type { AboPlan, PlanAngebot, VergebenerPreis } from "@/lib/premiumLimits";

// Das Payment Element rendert in einem Stripe-eigenen iframe und erbt weder
// die CSS-Variablen aus app/globals.css noch das Farbschema der Seite — die
// Farben müssen ihm als feste Werte mitgegeben werden. Deshalb stehen die
// Token-Werte aus globals.css hier ein zweites Mal, je einmal pro Schema:
// ohne den dunklen Satz stand mitten auf einer dunklen Seite ein hellgraues
// Formular.
//
// Wer die Farben in globals.css ändert, muss sie hier mitziehen. Eine
// Ableitung zur Laufzeit (getComputedStyle) wäre möglich, brächte aber
// color-mix()-Ergebnisse in unklaren Farbräumen an eine fremde Bibliothek —
// zwei gepflegte Paletten sind der ehrlichere Weg.
function appearance(dunkel: boolean): StripeElementsOptions["appearance"] {
  const farben = dunkel
    ? {
        background: "#0B0B0D",
        text: "#F2F2F4",
        textSecondary: "#8F95A3",
        accent: "#6B83FF",
        border: "rgba(242,242,244,0.32)",
      }
    : {
        background: "#FAFAFA",
        text: "#131316",
        textSecondary: "#8A8F98",
        accent: "#3D5AFE",
        border: "rgba(19,19,22,0.3)",
      };

  return {
    theme: "flat",
    variables: {
      colorPrimary: farben.accent,
      colorBackground: farben.background,
      colorText: farben.text,
      colorTextSecondary: farben.textSecondary,
      colorDanger: "#DC2626",
      fontFamily: "'Inter', sans-serif",
      fontSizeBase: "14px",
      borderRadius: "12px",
      spacingUnit: "4px",
    },
    rules: {
      ".Input": { border: `1px solid ${farben.border}`, boxShadow: "none" },
      ".Input:focus": { border: `1px solid ${farben.accent}`, boxShadow: "none" },
      ".Label": { color: farben.textSecondary, fontSize: "12px" },
      ".Tab": { border: `1px solid ${farben.border}`, borderRadius: "12px" },
      ".Tab--selected": { border: `1px solid ${farben.accent}`, boxShadow: "none" },
    },
  };
}

const FONTS: NonNullable<StripeElementsOptions["fonts"]> = [
  { cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" },
];

// Liest das wirksame Farbschema und folgt jedem Wechsel — der manuellen Wahl
// (ThemeToggle) genauso wie einer umgestellten Systemeinstellung. Der
// Server-Snapshot ist "hell": auf dem Server gibt es kein Farbschema, und
// react-stripe-js aktualisiert das Erscheinungsbild ohnehin, sobald der
// Client den echten Wert kennt.
function useDunklesSchema(): boolean {
  return useSyncExternalStore(subscribeToThemeChange, isDarkTheme, () => false);
}

// Wie weit die Zahlung im Bezahlfenster gediehen ist. Bewusst eine Angabe
// statt zweier Booleans, und bewusst im Elternteil gehalten: davon hängt
// nicht nur die Beschriftung der Schaltfläche ab, sondern auch, ob das
// Fenster überhaupt geschlossen werden darf.
//
// - "offen": nichts ausgelöst, Schliessen kostet nichts.
// - "laeuft": confirmPayment ist unterwegs. Kein Weg hinaus — siehe unten.
// - "bezahlt": Geld ist geflossen (oder fliesst, etwa bei TWINT), die
//   Bestätigung steht noch aus.
type Zahlphase = "offen" | "laeuft" | "bezahlt";

// Stripe-Fehlercodes in Sätze übersetzen, die sagen, was jetzt zu tun ist.
// Die Meldungen von Stripe sind englisch und technisch ("Your card was
// declined."); wer hier gerade bezahlen wollte, braucht den nächsten
// Schritt, nicht die Diagnose.
//
// Der Rückfall auf submitError.message ist Absicht: Stripe kennt mehr Fälle,
// als hier stehen, und eine ungenaue englische Meldung ist immer noch
// besser als "Zahlung fehlgeschlagen." ohne jeden Hinweis.
function fehlertext(code: string | undefined, declineCode: string | undefined): string | null {
  if (declineCode === "insufficient_funds") {
    return "Die Karte hat kein Guthaben mehr. Versuch es mit einer anderen Zahlungsart.";
  }
  switch (code) {
    case "card_declined":
      return "Deine Bank hat die Zahlung abgelehnt. Versuch es mit einer anderen Karte oder mit TWINT.";
    case "expired_card":
      return "Diese Karte ist abgelaufen.";
    case "incorrect_cvc":
    case "invalid_cvc":
      return "Die Prüfziffer stimmt nicht. Bitte kontrollier die drei Ziffern auf der Rückseite.";
    case "incorrect_number":
    case "invalid_number":
      return "Diese Kartennummer stimmt nicht.";
    case "processing_error":
      return "Bei der Bank ist etwas schiefgelaufen. Versuch es in ein paar Minuten noch einmal.";
    case "payment_intent_authentication_failure":
      return "Die Bestätigung bei deiner Bank wurde abgebrochen. Starte die Zahlung noch einmal.";
    default:
      return null;
  }
}

function preisText(preis: VergebenerPreis): string {
  return betragText(preis.betragRappen, preis.waehrung);
}

/** Der Rückweg für Zahlungsarten mit Weiterleitung (TWINT) — und derselbe
 *  Weg, auf dem jemand landet, der das Fenster nach dem Bezahlen schliesst. */
function abschlussPfad(subscriptionId: string): string {
  return `/profil/premium/abschluss?abo=${encodeURIComponent(subscriptionId)}`;
}

// Die Pflichtangaben unmittelbar über der Schaltfläche, die die
// Zahlungspflicht auslöst. Sie stehen auch auf der Kaufseite darunter, in
// etwas mehr Ruhe — hier noch einmal knapp, weil der Kauf seit dem Umbau in
// diesem Fenster ausgelöst wird und ein Hinweis hinter einem geschlossenen
// Fenster kein Hinweis ist.
function Pflichtangaben({ plan }: { plan: AboPlan }) {
  return (
    <p className="text-xs leading-relaxed text-muted">
      Verlängert sich automatisch um {verlaengerungsZeitraum(plan)}, bis du kündigst — jederzeit
      ohne Frist in deinem Profil. 14 Tage Geld zurück auf formlose Anfrage: freiwillige Zusage,
      kein gesetzliches Widerrufsrecht. Es gelten die{" "}
      <a
        href={LEGAL_URLS.agb}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        AGB
      </a>{" "}
      und die{" "}
      <a
        href={LEGAL_URLS.datenschutz}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Datenschutzerklärung
      </a>
      .
    </p>
  );
}

function CheckoutInner({
  subscriptionId,
  plan,
  preis,
  phase,
  aufPhase,
  onSuccess,
}: {
  subscriptionId: string;
  plan: AboPlan;
  preis: VergebenerPreis;
  phase: Zahlphase;
  aufPhase: (phase: Zahlphase) => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pruefen, setPruefen] = useState(false);

  // Erneut nachfragen, ob das Abo inzwischen aktiv ist. Der Weg für den
  // Fall, dass die Zahlung durch ist, die Bestätigung bei Stripe aber noch
  // ein paar Sekunden braucht — bei TWINT der Normalfall.
  //
  // try/finally, weil confirmSubscription eine Server Action ist und nicht
  // nur false zurückgeben, sondern auch werfen kann (Netzabbruch, Fehler in
  // der Action selbst). Ohne finally bliebe `pruefen` dann auf true und die
  // Schaltfläche für immer deaktiviert — ausgerechnet auf dem Bildschirm, wo
  // bereits bezahlt wurde und der Bezahl-Button absichtlich gesperrt ist. Es
  // gäbe keinen Weg mehr nach vorn.
  async function nochmalPruefen() {
    setPruefen(true);
    setError(null);
    try {
      const bestaetigt = await confirmSubscription(subscriptionId);
      if (bestaetigt) {
        onSuccess();
        return;
      }
      setError(
        "Die Zahlung ist noch nicht bestätigt. Warte einen Moment und versuch es noch einmal — " +
          "abgebucht wird nichts doppelt.",
      );
    } catch {
      setError(
        "Die Bestätigung liess sich gerade nicht prüfen. Versuch es noch einmal — " +
          "abgebucht wird nichts doppelt.",
      );
    } finally {
      setPruefen(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    aufPhase("laeuft");
    setError(null);

    const { error: submitError, paymentIntent } = await stripe.confirmPayment({
      elements,
      // return_url ist auch bei redirect: "if_required" PFLICHT, sobald das
      // Payment Element eine Weiterleitungs-Zahlungsart anbieten kann. TWINT
      // ist genau das — und für ein Schweizer Produkt die wichtigste. Ohne
      // die Angabe bricht Stripe.js die Bestätigung mit einem
      // Integrationsfehler ab, sobald jemand TWINT wählt.
      //
      // "if_required" bleibt: Kartenzahlungen werden weiterhin ohne
      // Seitenwechsel bestätigt, und nur die Zahlungsarten, die es brauchen,
      // laufen über die Weiterleitung. Die Weiterleitung führt aus dem
      // Browser heraus; das Bezahlfenster gibt es nach der Rückkehr nicht
      // mehr, und die Abschlussseite übernimmt dort — deshalb bleibt sie
      // eine vollwertige Seite und kein Zustand dieses Fensters.
      confirmParams: {
        return_url: `${window.location.origin}${abschlussPfad(subscriptionId)}`,
      },
      redirect: "if_required",
    });

    if (submitError) {
      setError(
        fehlertext(submitError.code, submitError.decline_code) ??
          submitError.message ??
          "Zahlung fehlgeschlagen.",
      );
      aufPhase("offen");
      return;
    }

    // "processing" gilt als Erfolg: TWINT und einige Bankverfahren
    // bestätigen nicht sofort. confirmSubscription unten prüft den
    // tatsächlichen Zustand bei Stripe nach — steht das Abo dort noch nicht
    // auf active, kommt false zurück und der Text unten erklärt das.
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      // Ab hier ist Geld geflossen (oder fliesst). Der Bezahl-Button bleibt
      // dauerhaft gesperrt, unabhängig davon, wie die Bestätigung ausgeht:
      // ein zweiter confirmPayment auf denselben PaymentIntent scheitert nur
      // noch, mit einer englischen Stripe-Rohmeldung, die fehlertext() nicht
      // übersetzt.
      aufPhase("bezahlt");
      const confirmed = await confirmSubscription(subscriptionId);
      if (confirmed) {
        onSuccess();
        return;
      }
      setError(
        "Die Zahlung läuft, ist aber noch nicht bestätigt. Das kann bei TWINT einen Moment " +
          "dauern. Abgebucht wird nichts doppelt.",
      );
      return;
    } else if (paymentIntent?.status === "requires_action") {
      setError("Die Bestätigung bei deiner Bank steht noch aus. Bitte schliess sie ab.");
    } else {
      setError("Zahlung konnte nicht abgeschlossen werden.");
    }
    aufPhase("offen");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <PaymentElement />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {phase === "bezahlt" ? (
        <>
          <Button type="button" variant="secondary" onClick={nochmalPruefen} disabled={pruefen}>
            {pruefen ? "Wird geprüft…" : "Erneut prüfen"}
          </Button>
          <p className="text-center text-xs text-muted">
            Du kannst dieses Fenster schliessen — die Prüfung läuft dann auf einer eigenen Seite
            weiter.
          </p>
        </>
      ) : (
        <>
          <Pflichtangaben plan={plan} />
          {/* Volle Breite und der Betrag auf der Schaltfläche selbst: das
              hier ist der Moment, in dem die Zahlungspflicht ausgelöst wird,
              und der Betrag darf dafür nicht in der Kopfzeile stehen
              bleiben. */}
          <Button
            type="submit"
            disabled={!stripe || phase === "laeuft"}
            aria-busy={phase === "laeuft"}
          >
            {phase === "laeuft"
              ? "Wird verarbeitet…"
              : `Zahlungspflichtig abonnieren — ${preisText(preis)}`}
          </Button>
          <p className="text-center text-xs text-muted">
            Zahlungsdaten gehen direkt an Stripe — Strado sieht und speichert sie nie.
          </p>
        </>
      )}
    </form>
  );
}

type IntentState =
  // Noch nichts angefordert — die Seite steht offen, bei Stripe ist nichts
  // passiert. Zugleich der Zustand, in dem das Bezahlfenster zu ist.
  | { status: "bereitzustarten" }
  | { status: "laedt" }
  | { status: "bereit"; clientSecret: string; subscriptionId: string; preis: VergebenerPreis }
  | { status: "fehler"; text: string };

export default function PremiumCheckoutForm({
  angebot,
  onSuccess,
}: {
  /** Der ausgewählte Plan mitsamt dem Preis, den die Kaufseite dafür
   *  ausgezeichnet hat. Der Preis dient nur dem Vergleich: weicht der
   *  tatsächlich vergebene davon ab, muss die Abweichung sichtbar werden,
   *  bevor jemand bestätigt. */
  angebot: PlanAngebot;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<IntentState>({ status: "bereitzustarten" });
  const [phase, setPhase] = useState<Zahlphase>("offen");
  const dunkel = useDunklesSchema();
  const plan = angebot.plan;

  // Das Abo wird erst angelegt, wenn ausdrücklich bezahlt werden soll —
  // nicht beim Öffnen der Seite. Ein Abo bei jedem Seitenaufruf anzulegen
  // hiesse, bei Stripe unbezahlte Abos fürs blosse Hinschauen zu stapeln.
  // Dass das Fenster erst mit diesem Klick aufgeht, ändert daran nichts:
  // der Klick ist die ausdrückliche Handlung, nicht das Öffnen der Seite.
  async function starten() {
    // Aus demselben Grund kein zweiter Aufruf, solange der erste läuft: ein
    // hektischer Doppelklick würde sonst zwei Abos anlegen.
    if (state.status === "laedt") return;
    setState({ status: "laedt" });
    setPhase("offen");
    const result = await createSubscriptionIntent(plan);
    setState(
      result.ok
        ? {
            status: "bereit",
            clientSecret: result.clientSecret,
            subscriptionId: result.subscriptionId,
            preis: result.preis,
          }
        : { status: "fehler", text: result.error },
    );
  }

  // Das Fenster ist genau dann offen, wenn eine Zahlung vorbereitet wird
  // oder vorbereitet ist. Ein zweiter "offen"-Zustand daneben könnte mit
  // diesem auseinanderlaufen.
  const fensterOffen = state.status !== "bereitzustarten";

  function schliessen() {
    // Während confirmPayment unterwegs ist, gibt es keinen Ausgang, und das
    // ist Absicht: Schliessen würde die Zahlung nicht abbrechen (die liegt
    // bei Stripe und der Bank), aber diese Komponente ausbauen — die
    // Antwort käme nirgendwo mehr an, confirmSubscription liefe nie, und
    // wer bezahlt hat, sähe eine Kaufseite, als wäre nichts gewesen. Die
    // Schaltfläche ist in dieser Phase ebenfalls gesperrt; Dialog bekommt
    // zusätzlich dismissable={false}, damit auch Escape und der Klick auf
    // den Hintergrund nicht daran vorbeikommen.
    if (phase === "laeuft") return;

    // Bezahlt, aber noch nicht bestätigt: hier darf geschlossen werden, nur
    // nicht ins Leere. Weiter geht es auf der Abschlussseite — derselben,
    // auf der auch eine TWINT-Weiterleitung landet. Sie prüft den Zustand
    // bei Stripe nach und schickt bei Erfolg ins Profil.
    if (phase === "bezahlt" && state.status === "bereit") {
      const ziel = abschlussPfad(state.subscriptionId);
      setState({ status: "bereitzustarten" });
      setPhase("offen");
      router.push(ziel);
      return;
    }

    // Sonst zurück auf Anfang. Das verwirft ein vorbereitetes Payment
    // Element samt allem, was schon eingetippt war — gewollt: wer das
    // Bezahlfenster schliesst, soll keine Kartendaten in einem unsichtbaren
    // Formular zurücklassen. Bei Stripe bleibt ein unbezahltes Abo im
    // Zustand "incomplete" stehen; createSubscriptionIntent verwendet genau
    // dieses beim nächsten Anlauf wieder, statt ein zweites anzulegen.
    setState({ status: "bereitzustarten" });
    setPhase("offen");
  }

  // Vor dem Anlegen steht der ausgezeichnete Preis in der Kopfzeile, danach
  // der tatsächlich vergebene — nie eine Zahl, die niemand mehr vertritt.
  const kopfPreis: VergebenerPreis =
    state.status === "bereit"
      ? state.preis
      : { betragRappen: angebot.betragRappen, waehrung: angebot.waehrung };

  return (
    <>
      <Button type="button" onClick={starten} disabled={state.status === "laedt"}>
        Weiter zur Zahlung
      </Button>

      {/* Eigenes Fenster statt eines Formulars am Seitenende: das Bezahlen
          ist ein Schritt für sich, und die Kaufseite darunter soll dabei
          nicht mitscrollen. Genutzt wird die vorhandene Dialog-Primitive
          (natives <dialog> mit showModal) — Fokus-Falle, Escape,
          Hintergrund-Sperre und Scroll-Sperre kommen damit vom Browser
          statt aus eigenem Code. Bewusst ohne Animation: es gibt nichts zu
          zeigen, was ein Einblenden erklären müsste, und damit auch nichts,
          was für prefers-reduced-motion abzuschalten wäre. */}
      <Dialog
        open={fensterOffen}
        onClose={schliessen}
        ariaLabel="Premium abschliessen"
        dismissable={phase !== "laeuft"}
        className="max-h-[85dvh] overflow-y-auto"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-title font-semibold">Premium abschliessen</h2>
              <p className="text-sm text-muted">
                {planTitel(plan)} · {betragText(kopfPreis.betragRappen, kopfPreis.waehrung)}{" "}
                {planZeitraum(plan)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={schliessen}
              disabled={phase === "laeuft"}
            >
              Schliessen
            </Button>
          </div>

          {/* Sagt, warum die Schaltfläche daneben gerade nicht geht. Ein
              gesperrter Ausgang ohne Begründung liest sich als Fehler —
              ausgerechnet in dem Moment, in dem gerade Geld unterwegs ist. */}
          {phase === "laeuft" && (
            <p role="status" aria-live="polite" className="text-xs text-muted">
              Die Zahlung läuft. Das Fenster bleibt so lange offen, damit die Antwort deiner Bank
              nicht ins Leere geht.
            </p>
          )}

          {state.status === "laedt" && (
            // Platzhalter in der Form, die das Payment Element gleich
            // einnimmt: ein einzeiliger Hinweis liesse das Fenster in dem
            // Moment springen, in dem das Formular erscheint. aria-live
            // meldet den Zustand denen, die den Sprung ohnehin nicht sehen.
            <div className="flex flex-col gap-3" aria-busy="true">
              <p role="status" aria-live="polite" className="text-sm text-muted">
                Zahlung wird vorbereitet…
              </p>
              <Skeleton className="h-11 rounded-md" />
              <Skeleton className="h-11 rounded-md" />
              <Skeleton className="h-10 w-full rounded-full" />
            </div>
          )}

          {state.status === "fehler" && (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-sm text-danger">
                {state.text}
              </p>
              <Button type="button" variant="secondary" onClick={starten}>
                Noch einmal versuchen
              </Button>
            </div>
          )}

          {state.status === "bereit" && (
            <div className="flex flex-col gap-3">
              {/* Zwischen dem Rendern der Kaufseite und dem Klick kann der
                  Preis bei Stripe geändert worden sein — die Seite liest ihn
                  beim Öffnen, das Abo entsteht erst jetzt. Dann muss der neue
                  Betrag dastehen, bevor jemand bestätigt: eine Seite, die den
                  einen Betrag auszeichnet, während ein anderer abgebucht
                  wird, ist ein falsch ausgezeichneter Preis und kein
                  Anzeigefehler. */}
              {state.preis.betragRappen !== angebot.betragRappen && (
                <p
                  role="alert"
                  className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger"
                >
                  Hinweis: Für dieses Abo gilt {preisText(state.preis)} statt des zuvor angezeigten
                  Betrags — der Preis wurde inzwischen angepasst. Der Betrag auf dem Button ist
                  der, der abgebucht wird.
                </p>
              )}
              {/* Kein key auf dem Schema: react-stripe-js reicht ein geändertes
                  appearance an elements.update() weiter. Ein Neuaufbau würde beim
                  Wechsel auf Dunkel — automatisch etwa bei Sonnenuntergang — mitten
                  im Bezahlen die bereits eingetippten Kartendaten verwerfen. */}
              <Elements
                stripe={getStripe()}
                options={{
                  clientSecret: state.clientSecret,
                  appearance: appearance(dunkel),
                  fonts: FONTS,
                }}
              >
                <CheckoutInner
                  subscriptionId={state.subscriptionId}
                  plan={plan}
                  preis={state.preis}
                  phase={phase}
                  aufPhase={setPhase}
                  onSuccess={onSuccess}
                />
              </Elements>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
