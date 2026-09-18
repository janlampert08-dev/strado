import { cookies } from "next/headers";
import { safeInternalPath } from "@/lib/utils/url";

// Die offene E-Mail-Bestätigung einer gerade angelegten Registrierung: an
// welche Adresse der Code ging und wohin es danach weitergehen soll.
//
// WARUM ES DAS BRAUCHT
//
// Der Code aus der E-Mail wird mit verifyOtp eingelöst, und das verlangt
// zwei Angaben: den Code UND die Adresse, zu der er gehört. Der Code kommt
// aus dem Formular — die Adresse darf nicht von dort kommen. Stünde sie als
// Feld im Formular oder als ?email= in der Adresszeile, dann wäre die
// Bestätigungsseite ein Formular, in das jemand eine fremde Adresse tippt
// und anschliessend Codes durchprobiert. Mit ihr in der Adresszeile stünde
// sie ausserdem im Browserverlauf, im Referrer und in jedem geteilten Link.
//
// Deshalb legt der Server sie selbst ab, in genau den beiden Momenten, in
// denen er sie ohnehin schon kennt und geprüft hat: nach einer erfolgreichen
// Registrierung (signUp) und nach einer Anmeldung, die am fehlenden
// Bestätigungshaken gescheitert ist (signIn, also nach richtigem Passwort).
//
// httpOnly, obwohl kein Geheimnis drinsteht: kein Client-Code braucht den
// Wert, und was das Browser-JS nicht sieht, kann ein XSS nicht auslesen oder
// umschreiben. Dieselbe Haltung wie beim Herkunfts- und beim
// Wiederherstellungs-Cookie.
//
// WAS DAS COOKIE NICHT IST
//
// Es ist keine Berechtigung. Wer seinen eigenen Browser bearbeitet, kann
// jede beliebige Adresse hineinschreiben — httpOnly hält Skripte fern, nicht
// die Entwicklerwerkzeuge. Was einen Missbrauch verhindert, ist deshalb
// nicht dieses Cookie, sondern der Code selbst (er liegt nur im fremden
// Postfach) und die Bremsen in lib/actions/auth.ts, die das Durchprobieren
// pro Adresse und pro IP begrenzen.
//
// NAME UND FRIST STEHEN IN DER DATENSCHUTZERKLÄRUNG
//
// Wörtlich, und zwar in zwei Repositories: docs/rechtstexte/datenschutz.md
// (Cookie-Tabelle in Ziff. 3.10) und die veröffentlichte HTML-Fassung in
// janlampert08-dev/stradoinfo. Anders als beim Herkunfts-Cookie steckt hier
// ein Personenbezug drin — die E-Mail-Adresse selbst —, weshalb die Zeile
// dort nicht verzichtbar ist. Eine Änderung an Name, Laufzeit oder Inhalt
// ist damit eine Rechtstext-Änderung und kein Refactor;
// lib/bestaetigung.test.ts nagelt beide Werte dafür fest.
export const BESTAETIGUNG_COOKIE = "strado_bestaetigung";

// 60 Minuten — dieselbe Dauer, die Supabase dem Code gibt (Email OTP
// Expiration, siehe supabase/email-vorlagen/README.md) und die die Vorlage
// im Text nennt. Länger wäre irreführend: die Seite stünde noch, der Code
// wäre längst tot. Kürzer wäre ärgerlich: dann verschwände die Seite,
// während der Code noch gilt.
export const BESTAETIGUNG_GUELTIG_SEKUNDEN = 60 * 60;

// Wohin signUp() und signIn() schicken, wenn eine Bestätigung offen ist.
// Als Konstante, weil drei Stellen darauf zeigen und ein Auseinanderlaufen
// hier heisst: Konto angelegt, Code verschickt, niemand kann ihn eingeben.
export const BESTAETIGUNG_PFAD = "/registrieren/bestaetigen";

// Länge des Codes aus der E-Mail — so, wie das Supabase-Projekt ihn
// tatsächlich verschickt (Authentication → Sign In / Providers → Email →
// Email OTP Length). Stand 2026-09-18 sind das acht Ziffern.
//
// Bis dahin stand hier eine 6, weil GoTrue früher sechs erzeugte. Das
// Projekt verschickte aber acht, und codeNormalisieren() liess nur genau
// sechs durch: die Seite verlangte einen „6-stelligen Code", die E-Mail
// brachte acht Ziffern, und wer sie korrekt eintippte, bekam „Bitte gib den
// 6-stelligen Code ein". Eine Registrierung war damit nicht abzuschliessen.
//
// Die Zahl steuert nur, was die Seite anzeigt und wie viele Kästchen das
// Feld hat. Angenommen wird jede Länge, die Supabase erlaubt (CODE_MIN bis
// CODE_MAX), damit eine spätere Änderung der Einstellung im Dashboard die
// Registrierung nicht noch einmal still abschaltet — schlimmstenfalls
// stimmt dann die Zahl im Text nicht, der Code geht trotzdem durch.
export const CODE_LAENGE = 8;

// Der Bereich, den Supabase für „Email OTP Length" zulässt.
const CODE_MIN = 6;
const CODE_MAX = 10;

export interface OffeneBestaetigung {
  /** Adresse, an die der Code ging — niemals aus einer Nutzereingabe. */
  email: string;
  /** Rücksprungziel nach der Bestätigung, oder null für die Startseite. */
  next: string | null;
}

// Begrenzung wie in lib/actions/auth.ts, damit ein von Hand aufgeblähtes
// Cookie nicht als Adresse durchgeht.
const MAX_EMAIL_LENGTH = 255;

/**
 * Bringt den eingegebenen Code auf seine kanonische Form, oder null, wenn er
 * keiner ist.
 *
 * Nicht-Ziffern fliegen heraus, statt die Eingabe abzuweisen: Codes werden
 * aus der E-Mail kopiert und kommen dabei mit Leerzeichen, einem
 * Gedankenstrich in der Mitte oder einem Zeilenumbruch am Ende an. Das ist
 * keine Nachlässigkeit der Nutzerin, sondern das, was Mail-Clients und
 * Zwischenablagen aus einem markierten Text machen — eine Fehlermeldung
 * dafür wäre reine Schikane.
 *
 * Danach zählt die Länge: was ausserhalb dessen liegt, was Supabase
 * überhaupt verschicken kann (CODE_MIN bis CODE_MAX), kann kein Code sein,
 * und es gar nicht erst an Supabase zu schicken spart einen Versuch aus dem
 * Kontingent, das die Bremse in lib/actions/auth.ts zählt.
 */
export function codeNormalisieren(roh: unknown): string | null {
  if (typeof roh !== "string") return null;
  const ziffern = roh.replace(/\D/g, "");
  return ziffern.length >= CODE_MIN && ziffern.length <= CODE_MAX
    ? ziffern
    : null;
}

/**
 * Packt die offene Bestätigung in den Cookie-Wert.
 *
 * JSON statt zweier Cookies, damit Adresse und Rücksprungziel nicht
 * auseinanderlaufen können — ein next ohne zugehörige Adresse wäre ein
 * Rücksprungziel für die Bestätigung von irgendwem.
 */
export function offeneBestaetigungPacken(
  email: string,
  next: string | null,
): string {
  return JSON.stringify({ email, next: next ?? null });
}

/**
 * Liest den Cookie-Wert zurück — defensiv, weil er aus dem Browser kommt.
 *
 * Alles, was nicht die erwartete Form hat, ergibt null und damit eine Seite,
 * die zur Registrierung zurückschickt. Das next läuft dabei ein zweites Mal
 * durch safeInternalPath: es ist beim Schreiben schon geprüft worden, aber
 * zwischen Schreiben und Lesen liegt ein Browser, den sein Besitzer
 * bearbeiten darf — und am Ende steht ein redirect().
 */
export function offeneBestaetigungLesen(
  roh: string | null | undefined,
): OffeneBestaetigung | null {
  if (typeof roh !== "string" || roh.length === 0) return null;

  let gelesen: unknown;
  try {
    gelesen = JSON.parse(roh);
  } catch {
    return null;
  }

  if (typeof gelesen !== "object" || gelesen === null) return null;
  const { email, next } = gelesen as { email?: unknown; next?: unknown };

  if (typeof email !== "string") return null;
  // Nur die grobe Form: ein @ mit etwas davor und dahinter, keine Leerzeichen
  // und nicht überlang. Ob die Adresse existiert, entscheidet ohnehin erst
  // GoTrue beim Einlösen — hier geht es darum, dass nichts Sinnloses in
  // einen Bremsen-Schlüssel oder in eine Anzeige gerät.
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;

  return {
    email,
    next: typeof next === "string" ? safeInternalPath(next) : null,
  };
}

/**
 * Für die Anzeige: „ja***@example.com" statt der vollen Adresse.
 *
 * Die Seite muss sagen, wohin der Code ging — sonst weiss niemand, in
 * welches von drei Postfächern er schauen soll. Sie muss die Adresse dafür
 * aber nicht ausschreiben: die Seite steht unangemeldet offen, und ein
 * Handy, das kurz auf dem Tisch liegt, zeigt sie sonst jedem im Raum.
 */
export function emailAndeuten(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const name = email.slice(0, at);
  const domain = email.slice(at);
  // Kurze Namen ganz verdecken — bei "jo@" bliebe von zwei Zeichen sonst
  // eines stehen und das wäre keine Andeutung mehr, sondern die Hälfte.
  if (name.length <= 2) return `${"*".repeat(name.length)}${domain}`;
  return `${name.slice(0, 2)}${"*".repeat(Math.min(name.length - 2, 6))}${domain}`;
}

const COOKIE_OPTIONEN = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Auf localhost läuft die Entwicklung über http; ein secure-Cookie käme
  // dort nie an. In Produktion ist es Pflicht.
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: BESTAETIGUNG_GUELTIG_SEKUNDEN,
};

// Die drei Hüllen um next/headers. Nur aus einer Server Action oder einem
// Route Handler aufrufbar — beim Rendern einer Server Component lässt Next
// kein Set-Cookie zu. Gelesen wird auch beim Rendern, das ist erlaubt.
export async function merkeBestaetigung(
  email: string,
  next: string | null,
): Promise<void> {
  const store = await cookies();
  store.set(
    BESTAETIGUNG_COOKIE,
    offeneBestaetigungPacken(email, next),
    COOKIE_OPTIONEN,
  );
}

export async function leseBestaetigung(): Promise<OffeneBestaetigung | null> {
  const store = await cookies();
  return offeneBestaetigungLesen(store.get(BESTAETIGUNG_COOKIE)?.value);
}

// Nach der eingelösten Bestätigung verbraucht: ab da ist das Konto aktiv,
// und eine stehengebliebene Adresse würde die Seite weiter anbieten, obwohl
// es nichts mehr zu bestätigen gibt.
export async function verbraucheBestaetigung(): Promise<void> {
  const store = await cookies();
  store.delete(BESTAETIGUNG_COOKIE);
}
