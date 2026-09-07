"use client";

import { useState, type FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripeClient";
import { createSubscriptionIntent, confirmSubscription } from "@/lib/actions/billing";
import type { AboPlan, VergebenerPreis } from "@/lib/premiumLimits";

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

function betragText(preis: VergebenerPreis): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: preis.waehrung.toUpperCase(),
  }).format(preis.betragRappen / 100);
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
  async function nochmalPruefen() {
    setPruefen(true);
    setError(null);
    const bestaetigt = await confirmSubscription(subscriptionId);
    if (bestaetigt) {
      onSuccess();
      return;
    }
    setError(
      "Die Zahlung ist noch nicht bestätigt. Warte einen Moment und versuch es noch einmal — " +
        "abgebucht wird nichts doppelt.",
    );
    setPruefen(false);
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
        <button
          type="button"
          onClick={nochmalPruefen}
          disabled={pruefen}
          className="self-start rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:border-border-strong disabled:opacity-50"
        >
          {pruefen ? "Wird geprüft…" : "Erneut prüfen"}
        </button>
      ) : (
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="self-start rounded-full border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform duration-fast active:scale-95 hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Wird verarbeitet…" : `Zahlungspflichtig abonnieren — ${betragText(preis)}`}
        </button>
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

  // Der Gründerpreis ist ein Kontingent: zwischen dem Rendern der Kaufseite
  // und diesem Klick kann der letzte Platz weg sein. Dann gilt der reguläre
  // Preis — und das muss dastehen, bevor jemand bestätigt. Eine Seite, die
  // CHF 39 auszeichnet, während CHF 49 abgebucht werden, ist ein falsch
  // ausgezeichneter Preis und kein Anzeigefehler.
  const preisWeichtAb = state.preis.betragRappen !== beworbenerPreis;

  return (
    <div className="flex flex-col gap-3">
      {preisWeichtAb && (
        <p role="alert" className="text-sm text-danger">
          Hinweis: Für dieses Abo gilt {betragText(state.preis)} statt des zuvor angezeigten
          Betrags — der letzte Gründerplatz war inzwischen vergeben. Der Betrag unten auf dem
          Button ist der, der abgebucht wird.
        </p>
      )}
      <Elements
        stripe={getStripe()}
        options={{ clientSecret: state.clientSecret, appearance: APPEARANCE, fonts: FONTS }}
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
