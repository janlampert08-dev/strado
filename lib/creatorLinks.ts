import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils/url";
import type { CreatorLink, CreatorLinkZiel } from "@/types/database";

// Creator-Einstiegslinks (siehe docs/creator-links-plan.md).
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
// dorthin ist Phase 2 und braucht Cookie, Trigger und eine Änderung der
// Datenschutzerklärung.
//
// Die Codes standen zunächst in einer Konstanten hier. Seit sie über
// /moderation/creator verwaltet werden, stehen sie in public.creator_links
// (Migration 0080) — sonst wäre "einen Creator anlegen" ein Deploy.

// Eng gefasst, weil der Wert unverändert in eine URL und in die Auswertung
// wandert: keine Grossbuchstaben (sonst zählte "Max" getrennt von "max"),
// keine Punkte oder Schrägstriche (sonst sähe ein Code wie ein Pfad aus).
// Dieselben Muster stehen als CHECK-Constraints in 0080 — die Anwendung ist
// die erste Schranke, die Datenbank die letzte.
const CODE_MUSTER = /^[a-z0-9-]{2,32}$/;
const KANAL_MUSTER = /^[a-z0-9_-]{2,32}$/;
const NAME_MAX = 80;

const UTM_MEDIUM = "creator";

// Kleinschreibung statt Abweisung: Wer den Code aus einem Video abtippt,
// tippt ihn irgendwann gross. "/c/MAX" soll denselben Creator treffen und
// nicht auf der Startseite ohne Zuordnung landen.
export function normalisiereCode(roh: string | null | undefined): string | null {
  if (typeof roh !== "string") return null;
  const code = roh.trim().toLowerCase();
  return CODE_MUSTER.test(code) ? code : null;
}

// Das interne Weiterleitungsziel inklusive UTM-Parametern.
//
// `ziel` ist der optionale ?z=-Parameter für einen Tiefenlink (etwa direkt
// auf eine Strecke, die im Video vorkommt). Er ist vollständig
// client-kontrolliert und läuft deshalb durch safeInternalPath() — den
// Open-Redirect-Schutz, den die App für jedes ?next= schon hat. Ohne ihn
// wäre /c/max?z=https://boese.example eine Weiterleitung auf fremdes Gebiet,
// ausgestellt von einer Domain, der die Leute vertrauen.
export function einstiegsPfad(link: CreatorLinkZiel, ziel?: FormDataEntryValue | null): string {
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

// ---------------------------------------------------------------------------
// Eingabeprüfung für das Formular unter /moderation/creator
// ---------------------------------------------------------------------------

export interface CreatorLinkEingabe {
  code: string;
  name: string;
  kanal: string;
  kampagne: string | null;
}

export type EingabePruefung =
  | { ok: true; wert: CreatorLinkEingabe }
  | { ok: false; fehler: string };

// Rein und damit testbar — die Server Action ruft sie auf, bevor sie
// schreibt. Sie ersetzt die CHECK-Constraints aus 0080 nicht, sondern
// ersetzt deren Fehlermeldung: ein verletzter Constraint käme als
// PostgREST-Fehler zurück, den niemand lesen will.
export function pruefeCreatorLinkEingabe(roh: {
  code?: FormDataEntryValue | null;
  name?: FormDataEntryValue | null;
  kanal?: FormDataEntryValue | null;
  kampagne?: FormDataEntryValue | null;
}): EingabePruefung {
  const code = normalisiereCode(typeof roh.code === "string" ? roh.code : null);
  if (!code) {
    return {
      ok: false,
      fehler:
        "Der Code darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten (2–32 Zeichen).",
    };
  }

  const name = (typeof roh.name === "string" ? roh.name : "").trim();
  if (!name) return { ok: false, fehler: "Bitte gib an, wer hinter dem Link steckt." };
  if (name.length > NAME_MAX) {
    return { ok: false, fehler: `Der Name darf höchstens ${NAME_MAX} Zeichen lang sein.` };
  }

  const kanal = (typeof roh.kanal === "string" ? roh.kanal : "").trim().toLowerCase();
  if (!KANAL_MUSTER.test(kanal)) {
    return {
      ok: false,
      fehler: "Der Kanal darf nur Kleinbuchstaben, Ziffern, Bindestriche und _ enthalten (2–32 Zeichen).",
    };
  }

  // Leer heisst "keine Kampagne" und nicht "leere Kampagne" — sonst stünde
  // ein utm_campaign= ohne Wert in jeder Adresse.
  const kampagneRoh = (typeof roh.kampagne === "string" ? roh.kampagne : "").trim().toLowerCase();
  if (kampagneRoh && !KANAL_MUSTER.test(kampagneRoh)) {
    return {
      ok: false,
      fehler:
        "Die Kampagne darf nur Kleinbuchstaben, Ziffern, Bindestriche und _ enthalten (2–32 Zeichen).",
    };
  }

  return { ok: true, wert: { code, name, kanal, kampagne: kampagneRoh || null } };
}

// ---------------------------------------------------------------------------
// Datenbank
// ---------------------------------------------------------------------------

// Die ganze Liste für die Moderationsansicht. Über den session-gebundenen
// Client: RLS gibt nur Moderatoren eine Zeile (0080), die Seite prüft den
// Status zusätzlich selbst (Defense-in-Depth wie in lib/actions/moderation.ts).
export async function alleCreatorLinks(): Promise<CreatorLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creator_links")
    .select("code, name, kanal, kampagne, aktiv, erstellt_am")
    .order("erstellt_am", { ascending: false })
    .returns<CreatorLink[]>();

  if (error) {
    console.error("Creator-Links konnten nicht gelesen werden", error);
    return [];
  }
  return data ?? [];
}

// Der öffentliche Weg: nur aktive Codes, nur die drei Felder, die die
// Weiterleitung braucht. Über die SECURITY DEFINER-Funktion aus 0080 und
// nicht über die Tabelle — die Begründung steht ausführlich dort und kurz
// hier: `name` ist personenbezogen, Spalten-Rechte vergibt Postgres pro
// Rolle, und Moderator wie Normalnutzer sind beide `authenticated`.
export async function creatorLinkAufloesen(
  rohCode: string | null | undefined,
): Promise<CreatorLinkZiel | null> {
  const code = normalisiereCode(rohCode);
  if (!code) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_link_aufloesen", { p_code: code });

  if (error) {
    console.error("Creator-Link konnte nicht aufgelöst werden", { code }, error);
    return null;
  }

  // Eine SQL-Funktion mit RETURNS TABLE liefert über PostgREST ein Array —
  // hier mit höchstens einer Zeile, weil code der Primärschlüssel ist. Die
  // Array-Prüfung statt eines Casts, weil types/database.ts heute
  // `Database = any` exportiert und der Client die Form nicht kennt.
  const zeilen: CreatorLinkZiel[] = Array.isArray(data) ? data : [];
  return zeilen[0] ?? null;
}
