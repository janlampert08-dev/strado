import { cookies } from "next/headers";

// Merkmal dafür, dass die aktuelle Sitzung gerade aus einem
// Passwort-zurücksetzen-Link entstanden ist.
//
// WARUM ES DAS BRAUCHT
//
// /profil/passwort-aendern bedient zwei Fälle mit derselben Seite:
//
//   1. Die angemeldete Person will ihr Passwort ändern (Link aus
//      /profil/einstellungen). Sie kennt ihr altes Passwort.
//   2. Die Person hat es vergessen, hat sich per E-Mail-Link eine neue
//      Sitzung geholt (requestPasswordReset → app/auth/callback) und kennt
//      es naturgemäss NICHT.
//
// Bis hierher verlangte updatePassword() in beiden Fällen nichts weiter als
// die neue Eingabe. Fall 1 war damit das, wovor deleteAccount() zwei
// Funktionen weiter unten ausdrücklich schützt: eine unbeaufsichtigt offene
// Sitzung auf einem geteilten Gerät reicht, um das Konto zu übernehmen —
// Passwort neu setzen, fertig. Die eigentliche Besitzerin ist ausgesperrt.
//
// Einfach immer das alte Passwort zu verlangen, schliesst Fall 2 aus. Also
// muss der Server die beiden Fälle unterscheiden können.
//
// WARUM EIN COOKIE UND NICHT DIE SITZUNG SELBST
//
// GoTrue schreibt zwar in den Token, über welche Methode angemeldet wurde
// (amr), aber an diese Claims käme man nur über getSession() heran — und das
// liest den lokalen, nicht gegengeprüften Token. AGENTS.md verlangt aus
// genau diesem Grund getUser() an jedem Kontrollpunkt und getSession()
// nirgends; getUser() wiederum liefert die Claims nicht mit.
//
// Deshalb setzt der Server das Merkmal selbst, und zwar an der einzigen
// Stelle, an der die Wiederherstellung nachweislich stattgefunden hat: nach
// einem erfolgreichen exchangeCodeForSession in app/auth/callback/route.ts.
// Das Cookie ist httpOnly (kein Zugriff aus dem Browser-JS), kurzlebig, und
// trägt als Wert die Nutzer-ID der so entstandenen Sitzung — es gilt also
// nicht für ein anderes Konto, das sich auf demselben Gerät danach anmeldet.
//
// Es berechtigt zu genau einer Sache: das alte Passwort beim Setzen des
// neuen wegzulassen. Mehr steckt nicht drin, und der Wert selbst (eine
// Nutzer-ID) ist ohnehin öffentlich — er steht in jeder /fahrer/[id]-URL.
export const WIEDERHERSTELLUNGS_COOKIE = "strado_pw_wiederherstellung";

// Der Pfad, für den der Callback das Merkmal setzt. requestPasswordReset()
// verdrahtet genau diesen als next-Ziel.
export const PASSWORT_AENDERN_PFAD = "/profil/passwort-aendern";

// Lang genug, um ein Passwort in Ruhe einzutippen (auch mit einem Blick in
// den Passwortmanager), kurz genug, dass ein danach unbeaufsichtigtes Gerät
// nicht stundenlang die Ausnahme trägt. Läuft es ab, verlangt die Seite das
// alte Passwort — wer es nicht kennt, fordert einen neuen Link an.
export const WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN = 15 * 60;

// Reine Entscheidung, getrennt vom Cookie-Zugriff, damit sie testbar ist.
//
// Der Vergleich gegen die Nutzer-ID ist der eigentliche Inhalt: ein blosses
// "Cookie vorhanden" würde auch dann noch gelten, wenn sich nach der
// Wiederherstellung jemand anderes auf demselben Gerät angemeldet hat.
export function wiederherstellungGiltFuer(
  cookieWert: string | undefined | null,
  userId: string,
): boolean {
  if (typeof cookieWert !== "string" || cookieWert.length === 0) return false;
  if (!userId) return false;
  return cookieWert === userId;
}

// Nur aus einem Route Handler oder einer Server Action aufrufbar — beim
// Rendern einer Server Component lässt Next kein Set-Cookie mehr zu.
export async function merkeWiederherstellung(userId: string): Promise<void> {
  const store = await cookies();
  store.set(WIEDERHERSTELLUNGS_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    // Auf localhost läuft die Entwicklung über http; ein secure-Cookie käme
    // dort nie an. In Produktion ist es Pflicht.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN,
  });
}

export async function istWiederherstellung(userId: string): Promise<boolean> {
  const store = await cookies();
  return wiederherstellungGiltFuer(store.get(WIEDERHERSTELLUNGS_COOKIE)?.value, userId);
}

// Nach dem gesetzten Passwort verbraucht: die Ausnahme soll nicht für einen
// zweiten Wechsel innerhalb der Viertelstunde weitergelten.
export async function verbraucheWiederherstellung(): Promise<void> {
  const store = await cookies();
  store.delete(WIEDERHERSTELLUNGS_COOKIE);
}
