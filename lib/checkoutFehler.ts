// Was von einem im Browser geworfenen Wert im Server-Log ankommt.
//
// Der Grund für die Meldung überhaupt steht ausführlich bei
// meldeCheckoutProblem in lib/actions/billing.ts: checkout.confirm() und die
// Bestätigung laufen im Browser, es gibt keine Fehlerberichterstattung (kein
// Sentry, siehe AGENTS.md), und im Server-Log steht nichts, weil nie eine
// Anfrage ankam.
//
// Hier statt in einer Komponente, weil zwei Stellen dasselbe brauchen — das
// Bezahlformular (components/PremiumCheckoutForm.tsx) und die
// Abschluss-Bestätigung (components/AboBestaetigung.tsx) — und weil die
// Funktion damit prüfbar wird: Vitest läuft in diesem Projekt nur über lib/
// (AGENTS.md). Bewusst ohne jeden Import: eine Abhängigkeit auf
// lib/actions/billing.ts zöge Stripe, Supabase und next/cache in den Test.

/**
 * Kurz gehalten: die Meldung reist als Server-Action-Argument, und im Log
 * will niemand einen minifizierten Stacktrace lesen — der Name plus die
 * Meldung sagt bereits, ob eine Origin blockiert wurde ("Failed to fetch"),
 * Stripe.js gestolpert ist oder das Netz wegbrach.
 */
export function fehlerMeldung(fehler: unknown): string {
  if (fehler instanceof Error) return `${fehler.name}: ${fehler.message}`;
  if (typeof fehler === "string") return fehler;
  return String(fehler);
}
