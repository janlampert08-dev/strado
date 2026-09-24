import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

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
// neuen wegzulassen. Mehr steckt nicht drin. Der Wert ist die Nutzer-ID
// PLUS HMAC-Signatur ("id.signatur"): die ID allein wäre von Hand pflanzbar
// — sie steht in jeder /fahrer/[id]-URL —, die Signatur lässt sich ohne das
// Server-Geheimnis nicht fälschen. Wer das Cookie im Opfer-Browser pflanzen
// kann (Subdomain, MITM, XSS), schaltet die Abfrage damit nicht mehr ab.
export const WIEDERHERSTELLUNGS_COOKIE = "strado_pw_wiederherstellung";

// Der Pfad, für den der Callback das Merkmal setzt. requestPasswordReset()
// verdrahtet genau diesen als next-Ziel.
export const PASSWORT_AENDERN_PFAD = "/profil/passwort-aendern";

// Lang genug, um ein Passwort in Ruhe einzutippen (auch mit einem Blick in
// den Passwortmanager), kurz genug, dass ein danach unbeaufsichtigtes Gerät
// nicht stundenlang die Ausnahme trägt. Läuft es ab, verlangt die Seite das
// alte Passwort — wer es nicht kennt, fordert einen neuen Link an.
export const WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN = 15 * 60;

// Das Geheimnis hinter der Cookie-Signatur: ein eigenes Server-Geheimnis,
// ersatzweise der Supabase-Secret-Key (serverseitig, nie im Client). Nur in
// der Entwicklung gibt es einen festen Rückfall, damit der Fluss dort nicht
// an einem fehlenden Geheimnis scheitert. In einem Produktions-Build
// scheitert er stattdessen: ein Geheimnis, das im Repository steht, liesse
// jeden die Signatur für fremde Nutzer-IDs ausrechnen und damit die Abfrage
// des alten Passworts abschalten. Tests übergeben ihr Geheimnis explizit.
function cookieGeheimnis(): string {
  const geheimnis =
    process.env.RECOVERY_COOKIE_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY;
  if (geheimnis) return geheimnis;
  if (process.env.NODE_ENV === "production") {
    throw new Error("RECOVERY_COOKIE_SECRET oder SUPABASE_SECRET_KEY fehlt");
  }
  return "nur-entwicklung-kein-geheimnis";
}

// Der Wert trägt seinen Ablauf SELBST, mitsigniert: "id.ablauf.signatur".
// Vorher war er HMAC(id) allein — jedes Mal derselbe Wert, und die
// Viertelstunde stand nur im maxAge, also in der Hand des Browsers. Ein
// einmal kopierter Wert (Proxy-Log, exportierte Cookies, Browser-Profil)
// hätte serverseitig für immer gegolten. Jetzt prüft der Server die Zeit.
/** Signiert eine Nutzer-ID samt Ablaufzeit für das Wiederherstellungs-Cookie. */
export function signiereWiederherstellung(
  userId: string,
  geheimnis: string = cookieGeheimnis(),
  jetztMs: number = Date.now(),
): string {
  const ablauf = Math.floor(jetztMs / 1000) + WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN;
  const sig = createHmac("sha256", geheimnis).update(`${userId}.${ablauf}`).digest("hex");
  return `${userId}.${ablauf}.${sig}`;
}

function signaturPruefen(
  wert: string,
  userId: string,
  geheimnis: string,
  jetztMs: number,
): boolean {
  // UUIDs enthalten keine Punkte — genau drei Teile, sonst ungültig. Ein
  // Wert im alten Format ("id.signatur") gilt damit nicht mehr; er war
  // höchstens eine Viertelstunde alt, wer mitten im Wechsel steckt, fordert
  // einen neuen Link an.
  const teile = wert.split(".");
  if (teile.length !== 3) return false;
  const [id, ablaufText, sig] = teile;
  if (!id || !sig || id !== userId) return false;
  if (!/^\d{1,12}$/.test(ablaufText)) return false;
  if (Number(ablaufText) * 1000 <= jetztMs) return false;
  const erwartet = createHmac("sha256", geheimnis).update(`${id}.${ablaufText}`).digest();
  let gegeben: Buffer;
  try {
    gegeben = Buffer.from(sig, "hex");
  } catch {
    return false;
  }
  if (gegeben.length !== erwartet.length) return false;
  return timingSafeEqual(gegeben, erwartet);
}

// Reine Entscheidung, getrennt vom Cookie-Zugriff, damit sie testbar ist.
//
// Der Vergleich gegen die Nutzer-ID ist der eigentliche Inhalt: ein blosses
// "Cookie vorhanden" würde auch dann noch gelten, wenn sich nach der
// Wiederherstellung jemand anderes auf demselben Gerät angemeldet hat. Die
// Signatur ist der zweite Teil: eine von Hand eingetragene ID ohne gültige
// Signatur gilt nicht.
export function wiederherstellungGiltFuer(
  cookieWert: string | undefined | null,
  userId: string,
  geheimnis: string = cookieGeheimnis(),
  jetztMs: number = Date.now(),
): boolean {
  if (typeof cookieWert !== "string" || cookieWert.length === 0) return false;
  if (!userId) return false;
  return signaturPruefen(cookieWert, userId, geheimnis, jetztMs);
}

// Wie lange nach dem Versand einer Zurücksetzen-E-Mail ein Code-Austausch
// noch als Wiederherstellung gelten darf. GoTrue lässt den Link
// standardmässig eine Stunde gelten; länger braucht es hier nicht.
export const ZURUECKSETZEN_MAIL_GUELTIG_MS = 60 * 60 * 1000;

function amrMethoden(accessToken: string | undefined | null): string[] | null {
  if (!accessToken) return null;
  const teile = accessToken.split(".");
  if (teile.length < 2) return null;
  try {
    const nutzlast = JSON.parse(Buffer.from(teile[1], "base64url").toString("utf8"));
    const amr: unknown = nutzlast?.amr;
    if (!Array.isArray(amr)) return null;
    return amr
      .map((eintrag) => (typeof eintrag === "string" ? eintrag : eintrag?.method))
      .filter((m): m is string => typeof m === "string");
  } catch {
    return null;
  }
}

// Entscheidet für den Code-Weg (PKCE) in app/auth/callback, ob ein
// erfolgreicher Austausch eine Wiederherstellung war.
//
// Bisher genügte dafür next === /profil/passwort-aendern. Den Pfad bestimmt
// aber, wer den Fluss startet — und JEDER Code-Austausch mit diesem Ziel
// setzte das Merkmal: auch eine Google-Anmeldung (signInMitGoogle reicht
// next durch) oder eine Registrierungsbestätigung. An einem unbeaufsichtigt
// angemeldeten Gerät eines Google-Kontos hiess das: /anmelden?next=
// /profil/passwort-aendern, "Mit Google" (ohne Rückfrage, die Einwilligung
// besteht), neues Passwort setzen, ohne das alte zu kennen — dauerhafte
// Übernahme.
//
// Jetzt zählen zwei Tatsachen aus der Antwort von GoTrue selbst, nicht aus
// der Adresszeile:
//   1. recovery_sent_at liegt in der letzten Stunde — es wurde tatsächlich
//      eine Zurücksetzen-E-Mail für dieses Konto verschickt;
//   2. die neue Sitzung stammt nicht aus einer OAuth-/SSO-Anmeldung (amr).
// Beides ist nötig: (1) allein liesse sich erfüllen, indem der Angreifer am
// fremden Gerät zuerst "Passwort vergessen" für das Opfer auslöst und dann
// mit Google anmeldet — (2) schliesst genau das aus.
//
// Bewusst NICHT auf ein amr "recovery" gewartet: ob GoTrue diesen Wert für
// den PKCE-Weg setzt, ist nicht dokumentiert, und ein falsches Nein sperrte
// jede echte Wiederherstellung aus.
export function codeAustauschIstWiederherstellung(eingabe: {
  accessToken: string | undefined | null;
  recoverySentAt: string | undefined | null;
  jetztMs?: number;
}): boolean {
  const jetzt = eingabe.jetztMs ?? Date.now();
  if (!eingabe.recoverySentAt) return false;
  const gesendet = Date.parse(eingabe.recoverySentAt);
  if (!Number.isFinite(gesendet)) return false;
  // Fünf Minuten Toleranz für Uhrabweichung zwischen GoTrue und Vercel.
  if (jetzt - gesendet > ZURUECKSETZEN_MAIL_GUELTIG_MS || gesendet - jetzt > 5 * 60 * 1000) {
    return false;
  }
  const methoden = amrMethoden(eingabe.accessToken) ?? [];
  if (methoden.some((m) => m.startsWith("oauth") || m.startsWith("sso"))) return false;
  return true;
}

// Nur aus einem Route Handler oder einer Server Action aufrufbar — beim
// Rendern einer Server Component lässt Next kein Set-Cookie mehr zu.
export async function merkeWiederherstellung(userId: string): Promise<void> {
  const store = await cookies();
  store.set(WIEDERHERSTELLUNGS_COOKIE, signiereWiederherstellung(userId), {
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
