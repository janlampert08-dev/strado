import { cookies } from "next/headers";
import { normalisiereCode } from "@/lib/creatorLinks";

// Die Herkunft eines Kontos: über welchen Creator-Link jemand in die App
// gekommen ist (siehe docs/herkunft-tracking-plan.md).
//
// WARUM ES DAS BRAUCHT
//
// Zwischen dem Klick auf app.strado.ch/c/max und der Registrierung liegen
// im Normalfall keine Sekunden, sondern Tage: erst schaut jemand die Karte
// an, dann kommt er zurück. Die UTM-Parameter, die app/c/[code]/route.ts
// anhängt, überleben schon den ersten internen Klick nicht — die
// Registrierung stünde danach ohne jede Herkunft da, und ein Premium-Kauf
// zwei Monate später erst recht.
//
// Dieses Cookie ist das einzige, was diese Lücke überbrückt.
//
// WAS DRIN STEHT UND WAS NICHT
//
// Drin steht ein Creator-Code — "max", "lea-moto". Kein Nutzerbezug, keine
// Kennung, nichts, was über mehrere Websites hinweg etwas bedeutet: Codes
// stehen öffentlich in TikTok-Captions. Der Wert wird ausserdem beim
// Registrieren verbraucht (verbraucheHerkunft), er ist also kein
// dauerhafter Begleiter.
//
// httpOnly, obwohl kein Geheimnis drinsteht: kein Client-Code braucht ihn,
// und was der Browser-JS nicht sieht, kann ein XSS nicht auslesen oder
// umschreiben. Dieselbe Haltung wie beim Wiederherstellungs-Cookie.
export const HERKUNFT_COOKIE = "strado_herkunft";

// 90 Tage. Lang genug für den realistischen Weg (Video sehen, später
// registrieren, noch später kaufen), kurz genug, dass es nicht unbegrenzt
// mitläuft. Die Obergrenze der Zuordnung ist damit technisch gesetzt; ob
// ein Kauf nach 60 oder 200 Tagen noch zählt, entscheidet dagegen die
// Auswertung — erfasst wird das Ereignis, abgeleitet wird die Regel.
export const HERKUNFT_GUELTIG_SEKUNDEN = 60 * 60 * 24 * 90;

export const HERKUNFT_COOKIE_OPTIONEN = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Der Klick kommt als Top-Level-Navigation aus dem TikTok- oder
  // Instagram-Browser; Lax sendet das Cookie dabei mit.
  //
  // secure nur in Produktion: auf localhost läuft die Entwicklung über
  // http, ein secure-Cookie käme dort nie an.
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: HERKUNFT_GUELTIG_SEKUNDEN,
};

// First Touch gewinnt — die eigentliche Geschäftsregel, und deshalb hier
// als reine Funktion statt als if im Route Handler: app/c/[code]/route.ts
// ist ein Route Handler, und für die gibt es in diesem Projekt keine Tests
// (Vitest läuft mit environment: "node", es gibt kein jsdom und keine
// E2E-Schicht). Was hier steht, ist getestet; was dort stünde, nicht.
//
// Warum First Touch und nicht Last Touch: sonst kassiert der Creator, der
// zufällig zuletzt verlinkt hat, einen Besucher, den ein anderer vor drei
// Wochen geholt hat. Wer jemanden auf die App aufmerksam macht, hat die
// Arbeit gemacht — nicht, wer ihn kurz vor der Registrierung nochmal
// gestreift hat.
//
// Rückgabe: der zu schreibende Wert, oder null, wenn nichts zu schreiben
// ist. Ein vorhandener, gültiger Wert bleibt damit unangetastet; ein
// vorhandener, unsinniger Wert (von Hand gesetzt, Rest einer alten
// Fassung) wird überschrieben statt für immer im Weg zu stehen.
export function herkunftCookieWert(
  vorhanden: string | null | undefined,
  neuerCode: string,
): string | null {
  if (normalisiereCode(vorhanden) !== null) return null;
  return normalisiereCode(neuerCode);
}

// Nur aus einer Server Action oder einem Route Handler aufrufbar — beim
// Rendern einer Server Component lässt Next kein Lesen mit anschliessendem
// Schreiben zu, und geschrieben wird hier nebenan.
//
// Normalisiert beim Lesen ein zweites Mal: das Cookie ist httpOnly, aber
// nicht signiert, und wer seinen eigenen Browser bearbeitet, kann
// hineinschreiben, was er will. Was hier herauskommt, hat damit die Form
// eines Codes — ob es ein vergebener, aktiver Code IST, entscheidet erst
// der Trigger in der Datenbank (Migration 0087).
export async function leseHerkunft(): Promise<string | null> {
  const store = await cookies();
  return normalisiereCode(store.get(HERKUNFT_COOKIE)?.value);
}

// Nach der Registrierung verbraucht: die Herkunft steht ab da in der
// Datenbank, das Cookie hat seinen Zweck erfüllt. Es stehen zu lassen
// hiesse, jedes weitere Konto aus demselben Browser demselben Creator
// zuzuschreiben — und Daten länger zu halten, als sie gebraucht werden.
export async function verbraucheHerkunft(): Promise<void> {
  const store = await cookies();
  store.delete(HERKUNFT_COOKIE);
}
