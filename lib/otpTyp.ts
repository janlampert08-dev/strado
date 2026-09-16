// Welche E-Mail-Typen der Callback über den token_hash-Weg einlösen darf.
//
// WARUM ES DAS BRAUCHT
//
// Der Zurücksetzen-Link wurde bisher per PKCE eingelöst: Supabase hängt
// ?code=… an, und der dazu passende Prüfwert liegt als Cookie in genau dem
// Browser, aus dem die Anfrage kam. Wer den Link in einem anderen Browser
// öffnet, kann ihn nicht einlösen.
//
// Beim Passwort-Zurücksetzen ist genau das der Normalfall, nicht die
// Ausnahme — gemessen am 2026-09-16: Anfrage um 15:49:55, ein Aufruf aus
// SamsungBrowser/Android um 15:49:56, der echte Klick um 15:50:18 aus
// Windows Chrome. Zwei Browser, also scheiterte das Einlösen, und die Person
// landete auf der Fehlermeldung.
//
// Der von Supabase dokumentierte serverseitige Weg dafür ist verifyOtp() mit
// einem token_hash aus der E-Mail. Der braucht kein Cookie und funktioniert
// deshalb auf jedem Gerät.
//
// WAS DAS KOSTET, UND WARUM ES TROTZDEM RICHTIG IST
//
// Die PKCE-Bindung war eine zusätzliche Hürde: ein abgefangener Link allein
// nützte nichts, es brauchte auch das Cookie. Diese Hürde entfällt — der
// Link in der E-Mail ist danach für sich genommen der Schlüssel.
//
// Das ist eine bewusste Abwägung, keine Umgehung. Die Bindung schützte nur
// den Fall, in dem jemand die E-Mail mitliest, aber nicht den Browser hat;
// wer ein fremdes Postfach liest, kann ohnehin beliebig oft einen neuen Link
// anfordern. Bezahlt wurde sie damit, dass die Funktion für den häufigsten
// echten Ablauf gar nicht funktionierte. Was die Sicherheit weiterhin trägt:
// der token_hash ist einmalig und läuft ab, GoTrue prüft ihn serverseitig,
// und das Setzen des neuen Passworts hängt zusätzlich am
// Wiederherstellungs-Merkmal aus lib/passwortWiederherstellung.ts.
//
// WARUM EINE ALLOW-LIST
//
// Der Typ kommt aus der Adresszeile und geht direkt an verifyOtp(). Ohne
// diese Prüfung liesse sich jeder von GoTrue unterstützte Typ ansprechen —
// darunter "email_change", das die Adresse eines Kontos umschreibt. Erlaubt
// ist deshalb nur, was unsere eigenen E-Mails überhaupt erzeugen.

/** Zurücksetzen-Link aus requestPasswordReset(). */
export const OTP_RECOVERY = "recovery";

/** Bestätigungslink aus signUp(), falls die Bestätigung eingeschaltet wird. */
export const OTP_SIGNUP = "signup";

const ERLAUBT = [OTP_RECOVERY, OTP_SIGNUP] as const;

export type ErlaubterOtpTyp = (typeof ERLAUBT)[number];

export function istErlaubterOtpTyp(
  roh: string | null | undefined,
): roh is ErlaubterOtpTyp {
  return typeof roh === "string" && (ERLAUBT as readonly string[]).includes(roh);
}
