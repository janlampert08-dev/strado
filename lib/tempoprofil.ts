import { haversineKm, type TrailPoint } from "@/lib/geo";
import { speedStufe } from "@/lib/speed";

// Das Tempo entlang einer Fahrt: wie schnell man wo war. Die Grundlage für
// die eingefärbte Linie auf der Fahrtkarte und das Tempodiagramm neben dem
// Höhenprofil (app/fahrten/[id]/page.tsx).
//
// NUR FÜR DEN FAHRER SELBST. route_completions.tempoprofil ist per RLS nur
// für den Besitzer lesbar und steht in keiner der öffentlichen Views
// (public_fahrten & Co.) — siehe 0115_tempoprofil.sql. Der Grund ist AGB
// Ziff. 11.3 ("kein Wettbewerb um Geschwindigkeit") und Art. 90 SVG: eine
// öffentliche Karte, auf der steht, wo jemand wie schnell war, wäre ein
// Beweismittel gegen ihn und eine Einladung zum Vergleichen. Wer diese Daten
// irgendwann in ein Teilen-Bild, einen Feed oder eine öffentliche View
// hängen will, muss zuerst diese Abwägung neu führen.
//
// Gespeichert wird nicht der Zeitstempel je Punkt, sondern ein fertig
// geglättetes Profil {km, kmh}: die gespeicherte Track-Geometrie ist
// vereinfacht (lib/track.ts) und hat keine Zeiten mehr, und ein Profil in
// derselben Form wie das Höhenprofil lässt sich ohne Umrechnung zeichnen.

export interface TempoprofilPunkt {
  km: number;
  kmh: number;
}

// Höchstens so viele Stützpunkte je Fahrt — wie beim Höhenprofil eine Grösse,
// die das Diagramm glatt zeichnet und die Zeile klein hält.
export const MAX_TEMPOPROFIL_PUNKTE = 400;

// Kleinster Abstand zwischen zwei Stützpunkten. Kürzere Fahrten bekommen
// entsprechend weniger Punkte statt eines künstlich feinen Rasters.
const MIN_SCHRITT_KM = 0.1;

// Halbe Breite des Glättungsfensters. Das Tempo an einer Stelle ist die
// Durchschnittsgeschwindigkeit über ±200 m — kurz genug, dass eine
// Ortsdurchfahrt sichtbar bleibt, lang genug, dass ein einzelner GPS-Ausreisser
// keine Spitze erzeugt.
const MIN_HALBFENSTER_KM = 0.2;

// Obergrenze gegen Messfehler (ein Punkt, der springt). Alles darüber ist
// kein Fahren mehr, sondern ein Fehler in der Aufzeichnung.
const MAX_KMH = 250;

// Unterhalb dieser Länge gibt es nichts, was sich als Verlauf lohnt.
const MIN_LAENGE_KM = 0.5;

// Gleiche Mindestlänge je Teilstück wie computeTrailStats (lib/geo.ts), damit
// die km-Achse des Profils mit distanz_km der Fahrt übereinstimmt: GPS-Zittern
// im Stand zählt nicht als Strecke, die Standzeit aber sehr wohl als Zeit.
const MIN_SEGMENT_KM = 0.005;

/**
 * Berechnet das Tempoprofil aus den ROHEN Trailpunkten (mit Zeitstempel).
 * Gibt null zurück, wenn die Fahrt zu kurz ist oder die Zeitstempel nichts
 * hergeben.
 */
export function buildTempoprofil(trail: TrailPoint[]): TempoprofilPunkt[] | null {
  if (trail.length < 2) return null;

  // Kumulierte Distanz und Zeit an jedem gezählten Punkt.
  const km: number[] = [0];
  const t: number[] = [trail[0].t];
  let last = trail[0];
  for (let i = 1; i < trail.length; i++) {
    const p = trail[i];
    const segment = haversineKm([last.lng, last.lat], [p.lng, p.lat]);
    if (segment > MIN_SEGMENT_KM) {
      km.push(km[km.length - 1] + segment);
      t.push(p.t);
      last = p;
    }
  }

  const laenge = km[km.length - 1];
  if (laenge < MIN_LAENGE_KM) return null;

  // Zeitpunkt, zu dem die Fahrt bei Kilometer x war (linear zwischen den
  // beiden umgebenden Punkten). km ist aufsteigend, also binär suchen.
  function zeitBei(x: number): number {
    let lo = 1;
    let hi = km.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (km[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    const k0 = km[lo - 1];
    const k1 = km[lo];
    const anteil = k1 > k0 ? (x - k0) / (k1 - k0) : 0;
    return t[lo - 1] + anteil * (t[lo] - t[lo - 1]);
  }

  const schritt = Math.max(MIN_SCHRITT_KM, laenge / (MAX_TEMPOPROFIL_PUNKTE - 1));
  const halbfenster = Math.max(MIN_HALBFENSTER_KM, schritt / 2);
  const anzahl = Math.floor(laenge / schritt) + 1;

  const profil: TempoprofilPunkt[] = [];
  for (let j = 0; j <= anzahl; j++) {
    const x = Math.min(j * schritt, laenge);
    // Wenn der letzte Rasterpunkt schon auf dem Ende liegt, nicht doppeln.
    if (j === anzahl && profil.length > 0 && profil[profil.length - 1].km >= laenge - 1e-6) break;
    const von = Math.max(0, x - halbfenster);
    const bis = Math.min(laenge, x + halbfenster);
    const sekunden = (zeitBei(bis) - zeitBei(von)) / 1000;
    const kmh = sekunden > 0 ? (bis - von) / (sekunden / 3600) : 0;
    profil.push({
      km: Math.round(x * 100) / 100,
      kmh: Math.round(Math.min(MAX_KMH, Math.max(0, kmh))),
    });
  }

  return profil.length >= 2 ? profil : null;
}

/**
 * Schneidet die gespeicherte Track-Geometrie in eingefärbte Abschnitte — eine
 * Farbe je Tempobereich, dieselben Farben wie die Tempolimit-Ebene
 * (speedColor in lib/speed.ts).
 *
 * Die km-Achse des Profils stammt aus den Rohpunkten, die Geometrie ist
 * vereinfacht und deshalb ein wenig kürzer. Das Profil wird deshalb auf die
 * Länge der Geometrie gestreckt, statt dass das Ende abgeschnitten wird.
 *
 * Anders als sliceRouteBySpeed wird an den Abschnittsgrenzen interpoliert:
 * eine vereinfachte Linie hat auf einer Geraden oft nur alle paar hundert
 * Meter einen Punkt, ein Abschnitt dazwischen hätte sonst gar keine.
 */
export function tempoAbschnitte(
  coords: [number, number][],
  profil: TempoprofilPunkt[],
): { coords: [number, number][]; stufe: number }[] {
  if (coords.length < 2 || profil.length < 2) return [];

  const kum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    kum.push(kum[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }
  const linienLaenge = kum[kum.length - 1];
  const profilLaenge = profil[profil.length - 1].km;
  if (linienLaenge <= 0 || profilLaenge <= 0) return [];
  const massstab = linienLaenge / profilLaenge;

  // Jeder Stützpunkt gilt bis zur Mitte zum nächsten; gleichfarbige
  // Nachbarn werden zu einem Lauf zusammengelegt.
  // Die Stufe statt der Farbe: berechnet wird das auf dem Server, der das
  // Farbschema des Betrachters nicht kennt. Gefärbt wird in RouteMap.
  const laeufe: { von: number; bis: number; stufe: number }[] = [];
  for (let i = 0; i < profil.length; i++) {
    const von = i === 0 ? 0 : (profil[i - 1].km + profil[i].km) / 2;
    const bis = i === profil.length - 1 ? profilLaenge : (profil[i].km + profil[i + 1].km) / 2;
    const stufe = speedStufe(profil[i].kmh);
    const vorher = laeufe[laeufe.length - 1];
    if (vorher && vorher.stufe === stufe) vorher.bis = bis;
    else laeufe.push({ von, bis, stufe });
  }

  function punktBei(x: number): [number, number] {
    let i = 1;
    while (i < kum.length - 1 && kum[i] < x) i++;
    const k0 = kum[i - 1];
    const k1 = kum[i];
    const anteil = k1 > k0 ? Math.min(1, Math.max(0, (x - k0) / (k1 - k0))) : 0;
    return [
      coords[i - 1][0] + anteil * (coords[i][0] - coords[i - 1][0]),
      coords[i - 1][1] + anteil * (coords[i][1] - coords[i - 1][1]),
    ];
  }

  return laeufe
    .map((lauf) => {
      const von = lauf.von * massstab;
      const bis = lauf.bis * massstab;
      const innen = coords.filter((_, i) => kum[i] > von && kum[i] < bis);
      return { coords: [punktBei(von), ...innen, punktBei(bis)], stufe: lauf.stufe };
    })
    .filter((a) => a.coords.length >= 2);
}

/** Prüft ein aus der Datenbank gelesenes jsonb-Feld, statt ihm blind zu trauen. */
export function alsTempoprofil(wert: unknown): TempoprofilPunkt[] | null {
  if (!Array.isArray(wert) || wert.length < 2) return null;
  const ok = wert.every(
    (p) =>
      p !== null &&
      typeof p === "object" &&
      typeof (p as TempoprofilPunkt).km === "number" &&
      typeof (p as TempoprofilPunkt).kmh === "number",
  );
  return ok ? (wert as TempoprofilPunkt[]) : null;
}

// Toleranz, bevor ein Durchschnitt als unvereinbar mit dem eigenen Profil
// gilt. Das Profil ist auf ganze km/h gerundet und über ±200 m geglättet;
// zwei km/h fangen Rundung und Randfenster ab.
const SCHNITT_TOLERANZ_KMH = 2;

/**
 * Der Durchschnitt, sofern er zum eigenen Tempoprofil passt — sonst null.
 *
 * Aus denselben Trailpunkten gerechnet kann der Durchschnitt über die ganze
 * Fahrt nie über dem höchsten Fensterwert liegen: jedes Fenster braucht
 * mindestens seine Länge geteilt durch das Höchsttempo an Zeit, also die
 * ganze Fahrt auch. Liegt er trotzdem darüber, stimmen Dauer und Profil
 * nicht zusammen (live gesehen: Fahrt 77992c64, "Ø 86 km/h" neben "Spitze
 * 74 km/h"), und dann ist die Zeit die schwächere der beiden Zahlen — die
 * Distanz prüft 0059 gegen die Geometrie. Lieber kein Durchschnitt als einer,
 * der sich selbst widerlegt.
 *
 * Ohne Profil (fremde Fahrt, ältere Fahrt) gibt es nichts zu prüfen, dann
 * bleibt der Durchschnitt stehen.
 */
export function stimmigerSchnitt(
  schnittKmh: number | null,
  profil: TempoprofilPunkt[] | null,
): number | null {
  if (schnittKmh === null || !Number.isFinite(schnittKmh)) return null;
  if (!profil || profil.length < 2) return schnittKmh;
  const spitze = Math.max(...profil.map((p) => p.kmh));
  return schnittKmh > spitze + SCHNITT_TOLERANZ_KMH ? null : schnittKmh;
}
