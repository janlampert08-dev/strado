import { safeInternalPath } from "@/lib/utils/url";

// Creator-Einstiegslinks — Phase 1 aus docs/creator-links-plan.md.
//
// Ein Creator bekommt genau eine kurze Adresse, app.strado.ch/c/<code>.
// app/c/[code]/route.ts leitet sie in die App weiter und hängt dabei die
// UTM-Parameter selbst an. Zwei Gründe, warum der kurze Pfad verteilt wird
// und nicht gleich der fertige UTM-Link:
//
// 1. Eine URL mit vier Query-Parametern lässt sich in einem Video nicht
//    aussprechen und in einer TikTok-Caption nicht anklicken.
// 2. Die Parameter stehen damit an einer Stelle. Wer sie in zwanzig
//    Direktnachrichten von Hand tippt, tippt sie neunzehnmal richtig.
//
// Ausgewertet wird in Vercel Web Analytics — der einzigen Telemetrie der App
// (siehe <Analytics /> in app/layout.tsx) — durch Gruppieren nach
// utm_content. Das misst **Aufrufe, keine Registrierungen**: der Schritt
// dorthin ist Phase 2 und kostet Cookie, Migration und eine Änderung der
// Datenschutzerklärung. Wer hier etwas anbaut, sollte den Plan vorher lesen.

export interface CreatorLink {
  /** Der Teil hinter /c/ — Kleinbuchstaben, Ziffern, Bindestrich. */
  code: string;
  /** Wer dahintersteckt. Erscheint nur in der Moderationsansicht. */
  name: string;
  /** Wird zu utm_source, z.B. "tiktok" oder "instagram". */
  kanal: string;
  /** Optional die Aktion, zu der der Link gehört (utm_campaign). */
  kampagne?: string;
}

// Bewusst eine Konstante und keine Tabelle: bei einer Handvoll Creator
// kostet ein Datenbank-Roundtrip pro Klick mehr, als er einbringt, und ein
// neuer Creator ist ein Ein-Zeilen-PR. Sobald der Trigger aus Phase 2
// denselben Code prüfen muss, zieht eine Tabelle nach — eine SQL-Funktion
// kann keine TypeScript-Konstante lesen.
//
// Leer, weil noch kein Code vergeben ist. Ein Eintrag sieht so aus:
//
//   { code: "max", name: "Max Muster", kanal: "tiktok", kampagne: "start26" }
//
// Der Code steht anschliessend in der Moderationsansicht unter
// /moderation/creator mit der fertigen Adresse zum Kopieren.
export const CREATOR_LINKS: readonly CreatorLink[] = [];

// Eng gefasst, weil der Wert unverändert in eine URL und in die Auswertung
// wandert: keine Grossbuchstaben (sonst zählte "Max" getrennt von "max"),
// keine Punkte oder Schrägstriche (sonst sähe ein Code wie ein Pfad aus).
const CODE_MUSTER = /^[a-z0-9-]{2,32}$/;

const UTM_MEDIUM = "creator";

// Kleinschreibung statt Abweisung: Wer den Code aus einem Video abtippt,
// tippt ihn irgendwann gross. "/c/MAX" soll denselben Creator treffen und
// nicht auf der Startseite ohne Zuordnung landen.
export function normalisiereCode(roh: string | null | undefined): string | null {
  if (typeof roh !== "string") return null;
  const code = roh.trim().toLowerCase();
  return CODE_MUSTER.test(code) ? code : null;
}

export function findeCreatorLink(
  roh: string | null | undefined,
  links: readonly CreatorLink[] = CREATOR_LINKS,
): CreatorLink | null {
  const code = normalisiereCode(roh);
  if (!code) return null;
  return links.find((link) => link.code === code) ?? null;
}

// Das interne Weiterleitungsziel inklusive UTM-Parametern.
//
// `ziel` ist der optionale ?z=-Parameter für einen Tiefenlink (etwa direkt
// auf eine Strecke, die im Video vorkommt). Er ist vollständig
// client-kontrolliert und läuft deshalb durch safeInternalPath() — den
// Open-Redirect-Schutz, den die App für jedes ?next= schon hat. Ohne ihn
// wäre /c/max?z=https://boese.example eine Weiterleitung auf fremdes Gebiet,
// ausgestellt von einer Domain, der die Leute vertrauen.
export function einstiegsPfad(link: CreatorLink, ziel?: FormDataEntryValue | null): string {
  const pfad = safeInternalPath(ziel) ?? "/";

  // Gegen eine Wegwerf-Basis auflösen, damit ein Query-String oder ein
  // Fragment im Ziel erhalten bleibt, statt beim Anhängen der UTM-Parameter
  // zerschossen zu werden. Der Host kann dabei nicht wechseln:
  // safeInternalPath lässt nur Pfade durch, die mit genau einem "/"
  // beginnen — nichts Protokollrelatives.
  const url = new URL(pfad, "https://ungenutzt.invalid");
  url.searchParams.set("utm_source", link.kanal);
  url.searchParams.set("utm_medium", UTM_MEDIUM);
  if (link.kampagne) url.searchParams.set("utm_campaign", link.kampagne);
  // Der Creator steht in utm_content, nicht in utm_campaign: eine Kampagne
  // kann mehrere Creator haben, und die Frage lautet, wer davon etwas
  // gebracht hat.
  url.searchParams.set("utm_content", link.code);

  return `${url.pathname}${url.search}${url.hash}`;
}

// Die Adresse, die der Creator bekommt — nur für die Anzeige in der
// Moderationsansicht; die Weiterleitung selbst braucht sie nicht.
//
// Die Basis kommt dort aus siteUrl() und nicht aus dem Host der Anfrage.
// Das ist der Unterschied zwischen einem Link, der funktioniert, und einem,
// der auf staging.strado.ch zeigt, weil ihn jemand von dort kopiert hat.
export function einstiegsUrl(basis: string, code: string): string {
  return `${basis.replace(/\/+$/, "")}/c/${code}`;
}
