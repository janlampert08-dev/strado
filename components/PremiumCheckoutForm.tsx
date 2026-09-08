"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import type {
  StripeCheckoutConfirmResult,
  StripeCheckoutElementsSdkOptions,
} from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripeClient";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import {
  createCheckoutSession,
  confirmCheckoutSession,
  meldeCheckoutProblem,
} from "@/lib/actions/billing";
import { isDarkTheme, subscribeToThemeChange } from "@/lib/theme";
import { betragText } from "@/lib/premiumAngebot";
import type { AboPlan, VergebenerPreis } from "@/lib/premiumLimits";

type ElementsOptionen = NonNullable<StripeCheckoutElementsSdkOptions["elementsOptions"]>;

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
//
// Ziel ist, dass die Felder von einem Feld der App nicht zu unterscheiden
// sind. Massgeblich ist fieldClassName() in components/ui/Input.tsx:
// rounded-lg (--radius-lg, 16px), 1px Rahmen in --color-border,
// durchsichtiger Grund, 14px Text, und im Fokus ein Akzentrahmen plus
// ring-2 ring-accent/15. Genau das bilden die Regeln unten nach; ein Ring
// ist in CSS ein box-shadow mit 2px Ausbreitung, deshalb steht er dort.
function appearance(dunkel: boolean): ElementsOptionen["appearance"] {
  const farben = dunkel
    ? {
        background: "#0B0B0D",
        text: "#F2F2F4",
        // --color-muted im Dunkelmodus.
        textSecondary: "#8F95A3",
        accent: "#6B83FF",
        // --color-border: 14 % der Vordergrundfarbe. Vorher standen hier
        // 32 % — das ist --color-border-strong und liess die Felder
        // deutlich kantiger wirken als jedes Feld der App daneben.
        border: "rgba(242,242,244,0.14)",
        // Fokusring wie ring-accent/15.
        ring: "rgba(107,131,255,0.15)",
        // --color-danger im Dunkelmodus. #DC2626 (der helle Wert) kommt
        // auf #0B0B0D nur auf 4.07:1 und fällt damit unter AA — genau der
        // Grund, aus dem globals.css im Dunkelmodus auf #EF4444 wechselt.
        danger: "#EF4444",
        // --color-accent-subtle, die Fläche des gewählten Tabs.
        accentSubtle: "#191C2F",
      }
    : {
        background: "#FAFAFA",
        text: "#131316",
        // --color-muted. Vorher #8A8F98 — der Wert, den globals.css wegen
        // 3.11:1 auf dem Hintergrund ausdrücklich ersetzt hat; er stand
        // hier noch, weil diese Palette beim Wechsel übersehen wurde.
        textSecondary: "#666B74",
        accent: "#3D5AFE",
        // --color-border: 12 % der Vordergrundfarbe (vorher 30 %).
        border: "rgba(19,19,22,0.12)",
        ring: "rgba(61,90,254,0.15)",
        danger: "#DC2626",
        accentSubtle: "#EBEDFA",
      };

  return {
    theme: "flat",
    variables: {
      colorPrimary: farben.accent,
      colorBackground: farben.background,
      colorText: farben.text,
      colorTextSecondary: farben.textSecondary,
      colorDanger: farben.danger,
      fontFamily: "'Inter', sans-serif",
      fontSizeBase: "14px",
      // --radius-lg, also dasselbe rounded-lg wie jedes Eingabefeld und
      // jede Card der App. Vorher 12px, was neben einem App-Feld sichtbar
      // eckiger aussah.
      borderRadius: "16px",
      spacingUnit: "4px",
    },
    rules: {
      // px-3 py-2 wie fieldClassName; Stripe rechnet Innenabstände sonst
      // aus spacingUnit hoch und kommt auf andere Werte als die App.
      ".Input": {
        border: `1px solid ${farben.border}`,
        boxShadow: "none",
        padding: "8px 12px",
      },
      ".Input:focus": {
        border: `1px solid ${farben.accent}`,
        boxShadow: `0 0 0 2px ${farben.ring}`,
      },
      ".Input--invalid": {
        border: `1px solid ${farben.danger}`,
        boxShadow: "none",
      },
      ".Label": { color: farben.textSecondary, fontSize: "12px" },
      ".Tab": { border: `1px solid ${farben.border}`, boxShadow: "none" },
      // Wie die Planauswahl auf der Kaufseite: Akzentrahmen auf getönter
      // Fläche (border-accent bg-accent-subtle in PremiumPurchaseView).
      ".Tab--selected": {
        border: `1px solid ${farben.accent}`,
        backgroundColor: farben.accentSubtle,
        boxShadow: "none",
      },
    },
  };
}

const FONTS: NonNullable<ElementsOptionen["fonts"]> = [
  { cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" },
];

// Liest das wirksame Farbschema und folgt jedem Wechsel — der manuellen Wahl
// (ThemeToggle) genauso wie einer umgestellten Systemeinstellung. Der
// Server-Snapshot ist "hell": auf dem Server gibt es kein Farbschema, und
// der CheckoutElementsProvider reicht ein geändertes appearance an
// changeAppearance() weiter, sobald der Client den echten Wert kennt.
function useDunklesSchema(): boolean {
  return useSyncExternalStore(subscribeToThemeChange, isDarkTheme, () => false);
}

type ConfirmFehler = Extract<StripeCheckoutConfirmResult, { type: "error" }>["error"];

// Stripe-Fehler in Sätze übersetzen, die sagen, was jetzt zu tun ist. Die
// Meldungen von Stripe sind englisch und technisch ("Your card was
// declined."); wer hier gerade bezahlen wollte, braucht den nächsten
// Schritt, nicht die Diagnose.
//
// Checkout meldet einen abgelehnten Zahlungsversuch als code
// "paymentFailed" und reicht den Decline-Code der Bank durch — feiner
// aufgeschlüsselt wird es hier nicht mehr. Der Rückfall auf error.message
// ist Absicht: Stripe kennt mehr Fälle, als hier stehen, und eine ungenaue
// englische Meldung ist immer noch besser als "Zahlung fehlgeschlagen."
// ohne jeden Hinweis.
function fehlertext(fehler: ConfirmFehler): string | null {
  if (fehler.code !== "paymentFailed") return null;

  switch (fehler.paymentFailed.declineCode) {
    case "insufficient_funds":
      return "Die Karte hat kein Guthaben mehr. Versuch es mit einer anderen Zahlungsart.";
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
    case "card_not_supported":
    case "currency_not_supported":
      return "Diese Karte wird für dieses Abo nicht unterstützt. Versuch es mit einer anderen Karte oder mit TWINT.";
    default:
      return "Deine Bank hat die Zahlung abgelehnt. Versuch es mit einer anderen Karte oder mit TWINT.";
  }
}

// Was von einem geworfenen Wert fürs Log übrig bleibt. Kurz gehalten: die
// Meldung reist als Server-Action-Argument, und im Log will niemand einen
// minifizierten Stacktrace lesen — der Name plus die Meldung sagt bereits,
// ob eine Origin blockiert wurde ("Failed to fetch"), Stripe.js gestolpert
// ist oder das Netz wegbrach.
function fehlerMeldung(fehler: unknown): string {
  if (fehler instanceof Error) return `${fehler.name}: ${fehler.message}`;
  if (typeof fehler === "string") return fehler;
  return String(fehler);
}

// Ins Server-Log melden, ohne die Oberfläche darauf warten zu lassen —
// und ohne dass ein Fehler beim Melden den Bezahlvorgang stört. Siehe
// meldeCheckoutProblem in lib/actions/billing.ts: ohne diesen Weg
// hinterlässt ein Fehler im Bezahlformular nirgendwo eine Spur.
function melde(sitzungId: string, phase: "vorbereitung" | "confirm" | "bestaetigung", fehler: unknown) {
  void meldeCheckoutProblem(sitzungId, phase, fehlerMeldung(fehler)).catch(() => {});
}

function preisText(preis: VergebenerPreis): string {
  return betragText(preis.betragRappen, preis.waehrung);
}

function CheckoutInner({
  sessionId,
  preis,
  onSuccess,
}: {
  sessionId: string;
  preis: VergebenerPreis;
  onSuccess: () => void;
}) {
  const checkoutStatus = useCheckoutElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Getrennt von `submitting`: nach einer erfolgten Zahlung darf der
  // Bezahl-Button nicht wieder aktiv werden, auch wenn die Bestätigung noch
  // aussteht. Ein zweiter confirm() auf dieselbe Session scheitert nur noch —
  // mit einer englischen Stripe-Rohmeldung, die fehlertext() nicht übersetzt.
  const [bezahlt, setBezahlt] = useState(false);
  const [pruefen, setPruefen] = useState(false);

  // Erneut nachfragen, ob das Abo inzwischen aktiv ist. Der Weg für den
  // Fall, dass die Zahlung durch ist, die Bestätigung bei Stripe aber noch
  // ein paar Sekunden braucht — bei TWINT der Normalfall.
  //
  // try/finally, weil confirmCheckoutSession eine Server Action ist und nicht
  // nur false zurückgeben, sondern auch werfen kann (Netzabbruch, Fehler in
  // der Action selbst). Ohne finally bliebe `pruefen` dann auf true und die
  // Schaltfläche für immer deaktiviert — ausgerechnet auf dem Bildschirm, wo
  // bereits bezahlt wurde und der Bezahl-Button absichtlich gesperrt ist. Es
  // gäbe keinen Weg mehr nach vorn.
  async function nochmalPruefen() {
    setPruefen(true);
    setError(null);
    try {
      const bestaetigt = await confirmCheckoutSession(sessionId);
      if (bestaetigt) {
        onSuccess();
        return;
      }
      setError(
        "Die Zahlung ist noch nicht bestätigt. Warte einen Moment und versuch es noch einmal — " +
          "abgebucht wird nichts doppelt.",
      );
    } catch (err) {
      melde(sessionId, "bestaetigung", err);
      setError(
        "Die Bestätigung liess sich gerade nicht prüfen. Versuch es noch einmal — " +
          "abgebucht wird nichts doppelt.",
      );
    } finally {
      setPruefen(false);
    }
  }

  if (checkoutStatus.type === "loading") {
    return <CheckoutSkeleton />;
  }

  if (checkoutStatus.type === "error") {
    return (
      <p role="alert" className="text-sm text-danger">
        {checkoutStatus.error.message}
      </p>
    );
  }

  const checkout = checkoutStatus.checkout;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // try/catch wie beim Anlegen der Session: wirft confirm() eine Ausnahme
    // (Netzabbruch, ein von der CSP blockierter Weiterleitungs-Sprung, ein
    // Fehler in Stripe.js), blieb submitting sonst für immer auf true — der
    // Button stand dauerhaft auf "Wird verarbeitet…", ohne Fehler und ohne
    // Weg nach vorn. Genau dieses Bild hat der Kauf im Live-Konto gezeigt.
    let antwort: StripeCheckoutConfirmResult;
    try {
      antwort = await checkout.confirm({
        // returnUrl ist auch bei redirect: "if_required" nötig, sobald das
        // Payment Element eine Weiterleitungs-Zahlungsart anbieten kann.
        // TWINT ist genau das — und für ein Schweizer Produkt die wichtigste.
        //
        // Die Session trägt bereits eine return_url mit der
        // {CHECKOUT_SESSION_ID}-Vorlage (siehe createCheckoutSession). Hier
        // steht dieselbe Adresse noch einmal mit der bereits bekannten
        // Session-ID: das nimmt der Rückweg der Zahlungsart, auf die es
        // ankommt, jede Abhängigkeit davon, dass die Vorlage ersetzt wird.
        //
        // "if_required" bleibt: Kartenzahlungen werden weiterhin ohne
        // Seitenwechsel bestätigt, und nur die Zahlungsarten, die es
        // brauchen, laufen über die Weiterleitung.
        returnUrl: `${window.location.origin}/profil/premium/abschluss?sitzung=${encodeURIComponent(sessionId)}`,
        redirect: "if_required",
      });
    } catch (err) {
      // Das Einzige, was von diesem Fehler je irgendwo ankommt: er ist im
      // Browser entstanden, es gibt keine Fehlerberichterstattung, und die
      // zahlende Person sieht nur den Satz unten.
      melde(sessionId, "confirm", err);
      // Bewusst als "nicht durchgelaufen" behandelt, aber mit dem Hinweis
      // auf die Doppelbuchung: geworfen hat der Aufruf, bevor Stripe ein
      // Ergebnis geliefert hat, und ob dabei schon etwas angestossen wurde,
      // weiss die Oberfläche nicht. Ein zweiter Versuch läuft auf derselben
      // Session weiter, es entsteht also keine zweite Zahlung.
      setError(
        "Die Zahlung liess sich gerade nicht bestätigen. Versuch es noch einmal — " +
          "abgebucht wird nichts doppelt.",
      );
      setSubmitting(false);
      return;
    }

    if (antwort.type === "error") {
      const uebersetzt = fehlertext(antwort.error);
      // Eine abgelehnte Karte ist kein Mangel der Anwendung und gehört
      // nicht ins Log. Alles andere schon: dann kennt fehlertext() den Fall
      // nicht, und im Formular stand gerade eine englische Rohmeldung.
      if (!uebersetzt) melde(sessionId, "confirm", antwort.error.message ?? antwort.error.code);
      setError(uebersetzt ?? antwort.error.message ?? "Zahlung fehlgeschlagen.");
      setSubmitting(false);
      return;
    }

    // Ab hier ist Geld geflossen (oder fliesst). Der Bezahl-Button bleibt
    // dauerhaft gesperrt, unabhängig davon, wie die Bestätigung ausgeht.
    setBezahlt(true);

    // Der Status der Session ist noch nicht die ganze Wahrheit: TWINT und
    // einige Bankverfahren bestätigen nicht sofort. confirmCheckoutSession
    // prüft den tatsächlichen Zustand bei Stripe nach — steht die Session
    // dort noch nicht auf complete/paid, kommt false zurück und der Text
    // unten erklärt das.
    try {
      const bestaetigt = await confirmCheckoutSession(sessionId);
      if (bestaetigt) {
        onSuccess();
        return;
      }
    } catch (err) {
      // Fällt in denselben Zwischenstand wie eine noch nicht verbuchte
      // Zahlung: der Weg nach vorn ist die Schaltfläche "Erneut prüfen".
      // Gemeldet wird er trotzdem — hier ist bereits Geld geflossen.
      melde(sessionId, "bestaetigung", err);
    }

    setError(
      "Die Zahlung läuft, ist aber noch nicht bestätigt. Das kann bei TWINT einen Moment " +
        "dauern. Abgebucht wird nichts doppelt.",
    );
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
          <Button type="submit" disabled={submitting} aria-busy={submitting}>
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

// Platzhalter in der Form, die das Payment Element gleich einnimmt: der
// frühere einzeilige Hinweis liess die Seite in dem Moment springen, in dem
// das Formular erschien. aria-live meldet den Zustand denen, die den Sprung
// ohnehin nicht sehen.
function CheckoutSkeleton() {
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

type SessionState =
  // Noch nichts angefordert — die Seite steht offen, bei Stripe ist nichts
  // passiert.
  | { status: "bereitzustarten" }
  | { status: "laedt" }
  | { status: "bereit"; clientSecret: string; sessionId: string; preis: VergebenerPreis }
  | { status: "fehler"; text: string };

export default function PremiumCheckoutForm({
  plan,
  beworbenerPreis,
}: {
  plan: AboPlan;
  /** Was die Kaufseite für diesen Plan ausgezeichnet hat. Dient nur dem
   *  Vergleich: weicht der tatsächlich vergebene Preis davon ab, muss die
   *  Abweichung sichtbar werden, bevor jemand bestätigt. */
  beworbenerPreis: number;
}) {
  const [state, setState] = useState<SessionState>({ status: "bereitzustarten" });
  const dunkel = useDunklesSchema();
  const router = useRouter();

  // Reine Netzabfrage ohne setState — verwendet sowohl vom Auto-Start beim
  // Erreichen dieser Seite (Effekt unten) als auch von "Noch einmal
  // versuchen". try/catch fängt eine unerwartete Ausnahme (Netzabbruch,
  // Fehler in der Server Action selbst) ab: ohne dieses Netz blieb der
  // Zustand in so einem Fall für immer auf "laedt" stehen — das Formular
  // zeigte endlos "Zahlung wird vorbereitet…", ohne dass je ein Fehler oder
  // ein Weg nach vorn erschien.
  async function ladeCheckoutErgebnis(): Promise<SessionState> {
    try {
      const result = await createCheckoutSession(plan);
      return result.ok
        ? {
            status: "bereit",
            clientSecret: result.clientSecret,
            sessionId: result.sessionId,
            preis: result.preis,
          }
        : { status: "fehler", text: result.error };
    } catch (err) {
      melde("", "vorbereitung", err);
      return {
        status: "fehler",
        text: "Zahlung konnte gerade nicht vorbereitet werden. Bitte versuch es noch einmal.",
      };
    }
  }

  // Für "Noch einmal versuchen": kein zweiter Aufruf, solange der erste
  // läuft — ein hektischer Doppelklick würde sonst zwei Sessions anlegen
  // (abgefangen ausserdem serverseitig über den Idempotency-Key, siehe
  // createCheckoutSession).
  async function starten() {
    if (state.status === "laedt") return;
    setState({ status: "laedt" });
    setState(await ladeCheckoutErgebnis());
  }

  // Diese Komponente lebt auf ihrer eigenen Seite
  // (app/profil/premium/zahlung), die erst erreicht wird, nachdem auf der
  // Kaufseite ein Plan gewählt und "Weiter zur Zahlung" angetippt wurde. Die
  // Session anzulegen ist an dieser Stelle also bereits die Handlung, die
  // dieser Klick ausgelöst hat — kein zweiter Tastendruck hier nötig. Ohne
  // synchrones setState im Effekt selbst (das löst Render-Kaskaden aus,
  // react-hooks/set-state-in-effect) — der Anfangszustand
  // "bereitzustarten" zeigt bereits dasselbe Skelett wie "laedt".
  useEffect(() => {
    ladeCheckoutErgebnis().then(setState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "bereitzustarten" || state.status === "laedt") {
    return <CheckoutSkeleton />;
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
  // Stripe geändert worden sein — die Seite liest ihn beim Öffnen, die
  // Session entsteht jetzt. Dann muss der neue Betrag dastehen, bevor jemand
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
      {/* Kein key auf dem Schema: der Provider reicht ein geändertes
          appearance an changeAppearance() weiter. Ein Neuaufbau würde beim
          Wechsel auf Dunkel — automatisch etwa bei Sonnenuntergang — mitten
          im Bezahlen die bereits eingetippten Kartendaten verwerfen. */}
      <CheckoutElementsProvider
        stripe={getStripe()}
        options={{
          clientSecret: state.clientSecret,
          elementsOptions: { appearance: appearance(dunkel), fonts: FONTS },
        }}
      >
        <CheckoutInner
          sessionId={state.sessionId}
          preis={state.preis}
          onSuccess={() => router.push("/profil")}
        />
      </CheckoutElementsProvider>
    </div>
  );
}
