"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripeClient";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { createSubscriptionIntent, confirmSubscription } from "@/lib/actions/billing";
import { isDarkTheme, subscribeToThemeChange } from "@/lib/theme";
import { betragText } from "@/lib/premiumAngebot";
import type { AboPlan, VergebenerPreis } from "@/lib/premiumLimits";

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

function CheckoutInner({
  subscriptionId,
  preis,
  onSuccess,
}: {
  subscriptionId: string;
  preis: VergebenerPreis;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Getrennt von `submitting`: nach einer erfolgten Zahlung darf der
  // Bezahl-Button nicht wieder aktiv werden, auch wenn die Bestätigung noch
  // aussteht. Ein zweiter confirmPayment auf denselben PaymentIntent
  // scheitert nur noch — mit einer englischen Stripe-Rohmeldung, die
  // fehlertext() nicht übersetzt.
  const [bezahlt, setBezahlt] = useState(false);
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
    setSubmitting(true);
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
      // laufen über die Weiterleitung.
      confirmParams: {
        return_url: `${window.location.origin}/profil/premium/abschluss?abo=${encodeURIComponent(subscriptionId)}`,
      },
      redirect: "if_required",
    });

    if (submitError) {
      setError(
        fehlertext(submitError.code, submitError.decline_code) ??
          submitError.message ??
          "Zahlung fehlgeschlagen.",
      );
      setSubmitting(false);
      return;
    }

    // "processing" gilt als Erfolg: TWINT und einige Bankverfahren
    // bestätigen nicht sofort. confirmSubscription unten prüft den
    // tatsächlichen Zustand bei Stripe nach — steht das Abo dort noch nicht
    // auf active, kommt false zurück und der Text unten erklärt das.
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      // Ab hier ist Geld geflossen (oder fliesst). Der Bezahl-Button bleibt
      // dauerhaft gesperrt, unabhängig davon, wie die Bestätigung ausgeht.
      setBezahlt(true);
      const confirmed = await confirmSubscription(subscriptionId);
      if (confirmed) {
        onSuccess();
        return;
      }
      setError(
        "Die Zahlung läuft, ist aber noch nicht bestätigt. Das kann bei TWINT einen Moment " +
          "dauern. Abgebucht wird nichts doppelt.",
      );
      setSubmitting(false);
      return;
    } else if (paymentIntent?.status === "requires_action") {
      setError("Die Bestätigung bei deiner Bank steht noch aus. Bitte schliess sie ab.");
    } else {
      setError("Zahlung konnte nicht abgeschlossen werden.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <PaymentElement />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {bezahlt ? (
        <Button type="button" variant="secondary" onClick={nochmalPruefen} disabled={pruefen}>
          {pruefen ? "Wird geprüft…" : "Erneut prüfen"}
        </Button>
      ) : (
        <>
          {/* Volle Breite und der Betrag auf der Schaltfläche selbst: das
              hier ist der Moment, in dem die Zahlungspflicht ausgelöst wird,
              und der Betrag darf dafür nicht weiter oben auf der Seite
              stehen bleiben. */}
          <Button type="submit" disabled={!stripe || submitting} aria-busy={submitting}>
            {submitting ? "Wird verarbeitet…" : `Zahlungspflichtig abonnieren — ${preisText(preis)}`}
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
  // passiert.
  | { status: "bereitzustarten" }
  | { status: "laedt" }
  | { status: "bereit"; clientSecret: string; subscriptionId: string; preis: VergebenerPreis }
  | { status: "fehler"; text: string };

export default function PremiumCheckoutForm({
  plan,
  beworbenerPreis,
  onSuccess,
}: {
  plan: AboPlan;
  /** Was die Kaufseite für diesen Plan ausgezeichnet hat. Dient nur dem
   *  Vergleich: weicht der tatsächlich vergebene Preis davon ab, muss die
   *  Abweichung sichtbar werden, bevor jemand bestätigt. */
  beworbenerPreis: number;
  onSuccess: () => void;
}) {
  const [state, setState] = useState<IntentState>({ status: "bereitzustarten" });
  const dunkel = useDunklesSchema();

  // Das Abo wird erst angelegt, wenn ausdrücklich bezahlt werden soll —
  // nicht beim Öffnen der Seite. Ein Abo bei jedem Seitenaufruf anzulegen
  // hiesse, bei Stripe unbezahlte Abos fürs blosse Hinschauen zu stapeln.
  async function starten() {
    // Aus demselben Grund kein zweiter Aufruf, solange der erste läuft: ein
    // hektischer Doppelklick würde sonst zwei Abos anlegen.
    if (state.status === "laedt") return;
    setState({ status: "laedt" });
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

  if (state.status === "bereitzustarten") {
    return (
      <Button type="button" onClick={starten}>
        Weiter zur Zahlung
      </Button>
    );
  }

  if (state.status === "laedt") {
    // Platzhalter in der Form, die das Payment Element gleich einnimmt: der
    // frühere einzeilige Hinweis liess die Seite in dem Moment springen, in
    // dem das Formular erschien. aria-live meldet den Zustand denen, die den
    // Sprung ohnehin nicht sehen.
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <p role="status" aria-live="polite" className="text-sm text-muted">
          Zahlung wird vorbereitet…
        </p>
        <Skeleton className="h-11 rounded-md" />
        <Skeleton className="h-11 rounded-md" />
        <Skeleton className="h-10 w-full rounded-full" />
      </div>
    );
  }

  if (state.status === "fehler") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-danger">
          {state.text}
        </p>
        <Button type="button" variant="secondary" onClick={starten}>
          Noch einmal versuchen
        </Button>
      </div>
    );
  }

  // Zwischen dem Rendern der Kaufseite und diesem Klick kann der Preis bei
  // Stripe geändert worden sein — die Seite liest ihn beim Öffnen, das Abo
  // entsteht jetzt. Dann muss der neue Betrag dastehen, bevor jemand
  // bestätigt: eine Seite, die den einen Betrag auszeichnet, während ein
  // anderer abgebucht wird, ist ein falsch ausgezeichneter Preis und kein
  // Anzeigefehler.
  const preisWeichtAb = state.preis.betragRappen !== beworbenerPreis;

  return (
    <div className="flex flex-col gap-3">
      {preisWeichtAb && (
        <p role="alert" className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger">
          Hinweis: Für dieses Abo gilt {preisText(state.preis)} statt des zuvor angezeigten
          Betrags — der Preis wurde inzwischen angepasst. Der Betrag auf dem Button ist der, der
          abgebucht wird.
        </p>
      )}
      {/* Kein key auf dem Schema: react-stripe-js reicht ein geändertes
          appearance an elements.update() weiter. Ein Neuaufbau würde beim
          Wechsel auf Dunkel — automatisch etwa bei Sonnenuntergang — mitten
          im Bezahlen die bereits eingetippten Kartendaten verwerfen. */}
      <Elements
        stripe={getStripe()}
        options={{ clientSecret: state.clientSecret, appearance: appearance(dunkel), fonts: FONTS }}
      >
        <CheckoutInner
          subscriptionId={state.subscriptionId}
          preis={state.preis}
          onSuccess={onSuccess}
        />
      </Elements>
    </div>
  );
}
