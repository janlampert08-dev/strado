// Das Verkehrsprofil einer Strecke: wie lange sie zu welcher Stunde dauert.
//
// Grundlage ist die Mapbox Directions API im Profil driving-traffic mit
// depart_at — Mapbox sagt die Fahrzeit für einen künftigen Abfahrtszeitpunkt
// aus historischen Fahrdaten voraus ("The travel time … is a prediction for
// travel time based on historical travel data and live traffic"). Gefragt wird
// für jede Stunde einer kommenden Woche; das Verhältnis zur schnellsten
// gefundenen Fahrzeit ist der gespeicherte Faktor.
//
// Aufgerufen vom Cron (app/api/cron/verkehrsprofil), nicht beim Seitenaufruf:
// eine Woche sind rund hundert Anfragen je Strecke.
import { haversineKm } from "@/lib/geo";

/** Stunden, zu denen jemand eine Passstrasse fährt. Nachts fragt niemand, und
 *  jede Stunde kostet je Wochentag eine Anfrage. */
export const PROFIL_STUNDEN = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;

/** driving-traffic nimmt höchstens 25 Koordinaten. Weniger Stützpunkte wären
 *  eine andere Strecke: ohne Zwischenpunkte sucht sich Mapbox den schnellsten
 *  Weg zwischen Start und Ziel — auf einer Passstrasse also den Tunnel. */
export const MAX_STUETZPUNKTE = 25;

export interface ProfilPunkt {
  wochentag: number;
  stunde: number;
  dauerSekunden: number;
}

/**
 * Gleichmässig verteilte Stützpunkte entlang der Geometrie, Anfang und Ende
 * immer dabei — dieselbe Idee wie sampleRoutePoints in lib/traffic.ts, hier
 * aber mit der harten Obergrenze der Directions-API.
 */
export function stuetzpunkte(
  koordinaten: [number, number][],
  anzahl: number = MAX_STUETZPUNKTE,
): [number, number][] {
  if (koordinaten.length <= anzahl) return [...koordinaten];
  const schritt = (koordinaten.length - 1) / (anzahl - 1);
  return Array.from({ length: anzahl }, (_, i) => koordinaten[Math.round(i * schritt)]);
}

/**
 * Faktoren aus den gemessenen Fahrzeiten: die schnellste Stunde der Woche ist
 * 1.00, alles andere ihr Vielfaches.
 *
 * Gerundet auf zwei Stellen, weil die dritte nichts mehr trägt; gekappt bei
 * 5.00, weil die Spalte dort ihre Grenze hat (0105) und ein Ausreisser sonst
 * den ganzen Schreibvorgang scheitern liesse.
 */
export function faktorenAusDauern(punkte: ProfilPunkt[]): {
  basisSekunden: number;
  faktoren: { wochentag: number; stunde: number; faktor: number }[];
} | null {
  const brauchbar = punkte.filter((p) => Number.isFinite(p.dauerSekunden) && p.dauerSekunden > 0);
  if (brauchbar.length === 0) return null;

  const basisSekunden = Math.min(...brauchbar.map((p) => p.dauerSekunden));
  if (!Number.isFinite(basisSekunden) || basisSekunden <= 0) return null;

  return {
    basisSekunden: Math.round(basisSekunden),
    faktoren: brauchbar.map((p) => ({
      wochentag: p.wochentag,
      stunde: p.stunde,
      faktor: Math.min(5, Math.max(1, Math.round((p.dauerSekunden / basisSekunden) * 100) / 100)),
    })),
  };
}

/**
 * Die Abfragezeitpunkte einer kommenden Woche: für jeden Wochentag und jede
 * Profilstunde ein Zeitpunkt in der Zukunft.
 *
 * depart_at braucht einen künftigen Zeitpunkt; ein vergangener würde die
 * Vorhersage verweigern oder die aktuelle Lage liefern. Gerechnet wird in
 * Schweizer Ortszeit, weil die Aussage "Sonntag 10 Uhr" eine lokale ist.
 */
export function abfrageZeitpunkte(
  ab: Date,
): { wochentag: number; stunde: number; abfahrtLokal: string }[] {
  const zeitpunkte: { wochentag: number; stunde: number; abfahrtLokal: string }[] = [];

  for (let tagVersatz = 1; tagVersatz <= 7; tagVersatz++) {
    const tag = new Date(ab.getTime() + tagVersatz * 24 * 60 * 60 * 1000);
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(tag);

    for (const stunde of PROFIL_STUNDEN) {
      // Die Ortszeit bleibt eine Zeichenkette und wird nie durch ein Date
      // gereicht: `new Date("2026-09-21T07:00")` ist Ortszeit DES SERVERS, und
      // der läuft auf Vercel in UTC — aus "Sonntag 7 Uhr" würde in der Schweiz
      // 9 Uhr. depart_at nimmt genau diese Form ohne Zonenangabe entgegen und
      // liest sie als lokale Zeit am Startpunkt.
      zeitpunkte.push({
        wochentag: isoWochentag(iso),
        stunde,
        abfahrtLokal: `${iso}T${String(stunde).padStart(2, "0")}:00`,
      });
    }
  }

  return zeitpunkte;
}

/** ISO-Wochentag (1 = Montag) aus einem YYYY-MM-DD, ohne Zeitzonenumweg. */
export function isoWochentag(iso: string): number {
  const [jahr, monat, tag] = iso.split("-").map(Number);
  const wochentag = new Date(Date.UTC(jahr, monat - 1, tag)).getUTCDay();
  return wochentag === 0 ? 7 : wochentag;
}

function mapboxToken(): string | null {
  // Ein eigener Server-Token ist der saubere Weg: der öffentliche Token im
  // Browser darf auf URL-Herkunft beschränkt sein, und eine Anfrage vom Server
  // trägt keine. Fehlt er, wird der öffentliche versucht.
  return process.env.MAPBOX_SERVER_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null;
}

/** Fahrzeit für einen Abfahrtszeitpunkt, oder null. */
export async function fahrzeitFuer(
  koordinaten: [number, number][],
  abfahrt: string,
): Promise<number | null> {
  const token = mapboxToken();
  if (!token || koordinaten.length < 2) return null;

  const punkte = stuetzpunkte(koordinaten);
  const pfad = punkte.map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(";");

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${pfad}` +
    `?overview=false&depart_at=${encodeURIComponent(abfahrt)}&access_token=${token}`;

  try {
    const antwort = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!antwort.ok) return null;
    const daten = (await antwort.json()) as { routes?: { duration?: number }[] };
    const dauer = daten.routes?.[0]?.duration;
    return typeof dauer === "number" && dauer > 0 ? dauer : null;
  } catch {
    return null;
  }
}

/** Grobe Länge einer Geometrie — nur zur Plausibilitätsprüfung im Cron. */
export function laengeKm(koordinaten: [number, number][]): number {
  let km = 0;
  for (let i = 1; i < koordinaten.length; i++) km += haversineKm(koordinaten[i - 1], koordinaten[i]);
  return km;
}
