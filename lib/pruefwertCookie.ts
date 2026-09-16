import { cookies } from "next/headers";

// Wartet, bis @supabase/ssr den PKCE-Prüfwert als Cookie abgelegt hat.
//
// WARUM ES DAS BRAUCHT
//
// requestPasswordReset() hat bisher auf die Antwort von
// resetPasswordForEmail() gewartet. Gemessen am 2026-09-16 gegen die
// Produktion dauert die rund 36 Sekunden: das Supabase-Gateway bricht
// /auth/v1/recover nach 10 s ab und wiederholt es dreimal. So lange stand
// "Wird gesendet…" im Formular, und ein Browser, der einen POST nicht
// beliebig lange offen hält (Mobilfunk, Tabwechsel), brach ihn ab — die
// Server Action warf, und die Fehlergrenze in app/error.tsx zeigte einen
// Fehlerschirm. Beide Symptome, ein Grund.
//
// Der Versand muss aber gar nicht abgewartet werden: er läuft serverseitig
// weiter (gemessen — nach 83 s war er erfolgreich, Status 200), und was die
// Antwort an den Browser tragen MUSS, ist nur das Prüfwert-Cookie. Ohne das
// liesse sich der Link aus der E-Mail später nicht einlösen.
//
// WARUM POLLEN UND NICHT EINFACH ZURÜCKKEHREN
//
// auth-js legt den Prüfwert ab, BEVOR es die Anfrage abschickt — gemessen
// nach 7 ms, während die Antwort 1229 ms brauchte (und im schlechten Fall
// 36 000 ms). Der Zeitpunkt ist aber nicht zugesichert, und ein zu früh
// beendeter Request hätte die teuerste Folge überhaupt: eine E-Mail mit
// einem Link, den niemand einlösen kann. Deshalb wird der Cookie-Speicher
// beobachtet statt auf ein Timing vertraut.
//
// Der Speicher aus next/headers ist innerhalb einer Anfrage schreib- UND
// lesbar: was lib/supabase/server.ts über cookieStore.set() ablegt, steht
// hier unmittelbar zur Verfügung. Deshalb braucht es keinen eigenen
// Cookie-Adapter und keine Änderung an der gemeinsamen Client-Fabrik.

// Namensbestandteil, den @supabase/ssr für den PKCE-Prüfwert verwendet
// (z.B. "sb-<ref>-auth-token-code-verifier"). Bewusst als Teilstring
// geprüft: das Präfix hängt an der Projekt-Referenz, und die Bibliothek
// legt je nach Version mehrere Varianten ab.
export const PRUEFWERT_KENNUNG = "code-verifier";

// Grosszügig über dem gemessenen Wert (7 ms) und weit unter dem, was ein
// Browser an Wartezeit toleriert. Läuft es ab, wird trotzdem geantwortet:
// der Versand läuft weiter, und ein fehlender Prüfwert kostet einen zweiten
// Anlauf — ein hängender Request kostet die ganze Seite.
export const PRUEFWERT_WARTEN_MS = 3000;

const SCHRITT_MS = 20;

export function hatPruefwert(namen: readonly string[]): boolean {
  return namen.some((name) => name.includes(PRUEFWERT_KENNUNG));
}

/** True, wenn der Prüfwert rechtzeitig stand; false beim Zeitablauf. */
export async function warteAufPruefwert(
  maxMs: number = PRUEFWERT_WARTEN_MS,
): Promise<boolean> {
  const bis = Date.now() + maxMs;

  for (;;) {
    const store = await cookies();
    if (hatPruefwert(store.getAll().map((k) => k.name))) return true;
    if (Date.now() >= bis) return false;
    await new Promise((fertig) => setTimeout(fertig, SCHRITT_MS));
  }
}
