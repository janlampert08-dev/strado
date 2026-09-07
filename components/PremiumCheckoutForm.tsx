"use client";

import { useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripeClient";
import { createSubscriptionIntent, confirmSubscription } from "@/lib/actions/billing";
import type { AboPlan } from "@/lib/premiumLimits";

const APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "flat",
  variables: {
    colorPrimary: "#3D5AFE",
    colorBackground: "#FAFAFA",
    colorText: "#131316",
    colorTextSecondary: "#8A8F98",
    colorDanger: "#DC2626",
    fontFamily: "'Inter', sans-serif",
    fontSizeBase: "14px",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { border: "1px solid rgba(19,19,22,0.3)", boxShadow: "none" },
    ".Input:focus": { border: "1px solid #3D5AFE", boxShadow: "none" },
    ".Label": { color: "#8A8F98", fontSize: "12px" },
    ".Tab": { border: "1px solid rgba(19,19,22,0.3)", borderRadius: "12px" },
    ".Tab--selected": { border: "1px solid #3D5AFE", boxShadow: "none" },
  },
};

const FONTS: NonNullable<StripeElementsOptions["fonts"]> = [
  { cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" },
];

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

function CheckoutInner({
  subscriptionId,
  onSuccess,
}: {
  subscriptionId: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError, paymentIntent } = await stripe.confirmPayment({
      elements,
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
      const confirmed = await confirmSubscription(subscriptionId);
      if (confirmed) {
        onSuccess();
        return;
      }
      setError(
        "Die Zahlung läuft, ist aber noch nicht bestätigt. Das kann bei TWINT einen Moment " +
          "dauern — lade die Seite in ein paar Sekunden neu. Abgebucht wird nichts doppelt.",
      );
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
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="self-start rounded-full border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform duration-fast active:scale-95 hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Wird verarbeitet…" : "Zahlungspflichtig abonnieren"}
      </button>
    </form>
  );
}

type IntentState =
  // Noch nichts angefordert — die Seite steht offen, bei Stripe ist nichts
  // passiert.
  | { status: "bereitzustarten" }
  | { status: "laedt" }
  | { status: "bereit"; clientSecret: string; subscriptionId: string }
  | { status: "fehler"; text: string };

export default function PremiumCheckoutForm({
  plan,
  onSuccess,
}: {
  plan: AboPlan;
  onSuccess: () => void;
}) {
  const [state, setState] = useState<IntentState>({ status: "bereitzustarten" });

  // Das Abo wird erst angelegt, wenn ausdrücklich bezahlt werden soll —
  // nicht beim Öffnen der Seite. Beim Jahresplan beansprucht der Aufruf
  // einen Gründerplatz (lib/actions/billing.ts); ein Abo bei jedem
  // Seitenaufruf anzulegen hiesse, Plätze fürs blosse Hinschauen zu
  // verbrennen und bei Stripe unbezahlte Abos zu stapeln.
  async function starten() {
    setState({ status: "laedt" });
    const result = await createSubscriptionIntent(plan);
    setState(
      result.ok
        ? { status: "bereit", clientSecret: result.clientSecret, subscriptionId: result.subscriptionId }
        : { status: "fehler", text: result.error },
    );
  }

  if (state.status === "bereitzustarten") {
    return (
      <button
        type="button"
        onClick={starten}
        className="self-start rounded-full border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform duration-fast active:scale-95 hover:opacity-90"
      >
        Weiter zur Zahlung
      </button>
    );
  }

  if (state.status === "laedt") {
    return <p className="text-sm text-muted">Zahlung wird vorbereitet…</p>;
  }

  if (state.status === "fehler") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-danger">
          {state.text}
        </p>
        <button
          type="button"
          onClick={starten}
          className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:border-border-strong"
        >
          Noch einmal versuchen
        </button>
      </div>
    );
  }

  return (
    <Elements
      stripe={getStripe()}
      options={{ clientSecret: state.clientSecret, appearance: APPEARANCE, fonts: FONTS }}
    >
      <CheckoutInner subscriptionId={state.subscriptionId} onSuccess={onSuccess} />
    </Elements>
  );
}
