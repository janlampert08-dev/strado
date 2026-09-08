import { haversineKm, type TrailPoint } from "@/lib/geo";
import { MAX_JUMP_KM, MOVING_MIN_KMH } from "@/lib/track";

// Aus einem aufgezeichneten GPS-Trail ableiten, ob die Bewegung überhaupt
// von einem Strassenfahrzeug stammen kann — oder ob sie nach Bahn bzw. Flug
// aussieht. Reine Funktion ohne I/O: derselbe Code läuft im Browser als
// früher Hinweis während der Fahrt und serverseitig als Bedingung fürs
// Speichern (lib/actions/completions.ts), so wie es Deckungsgrad
// (lib/routeCoverage.ts) und Teilbarkeit (publicationBlockReason in
// lib/track.ts) schon vormachen.
//
// Grundhaltung: Falsch-Positive sind deutlich teurer als Falsch-Negative.
// Wer eine Passstrasse wirklich gefahren ist und dessen Fahrt abgelehnt
// wird, verliert echte Arbeit — eine nicht erkannte Zugfahrt kostet nur
// einen falschen Eintrag. Deshalb sind alle Schwellen so gesetzt, dass eine
// schnelle, legale (und auch eine deutlich zu schnelle) Autobahnetappe
// durchgeht, und jede Ablehnung braucht mehrere unabhängige Signale
// gleichzeitig.

/**
 * Ein Trail-Punkt, optional mit der GPS-Genauigkeit des Fixes. Der Recorder
 * (components/useRideRecorder.ts) verwirft Fixes über MIN_ACCURACY_M schon
 * vor dem Trail, führt die Genauigkeit aber nicht mit — das Feld ist für
 * Aufrufer da, die sie haben (z.B. importierte Tracks), und bleibt sonst
 * schlicht leer.
 */
export interface BewegungsPunkt extends TrailPoint {
  acc?: number;
}

export type Bewegungsart = "unbestimmt" | "strassenfahrzeug" | "bahn" | "flug";

export interface Bewegungskennzahlen {
  punkte: number;
  distanzKm: number;
  /** Sekunden, in denen der Trail sich tatsächlich bewegt hat (ohne Halte). */
  bewegtSekunden: number;
  /** Zeitgewichteter Median der Fenstertempi in Bewegung. */
  tempoMedianKmh: number;
  /** Zeitgewichtetes 95%-Quantil — robuster als das blosse Maximum. */
  tempoP95Kmh: number;
  /** Anteil der Bewegtzeit oberhalb von BAHN_TEMPO_KMH (0..1). */
  zeitanteilUeberBahnTempo: number;
  /** Aufsummierte Sekunden oberhalb von FLUG_TEMPO_KMH. */
  sekundenUeberFlugTempo: number;
  /** Aufsummierte Richtungsänderung je Kilometer (Grad/km). */
  kurvigkeitGradProKm: number;
}

export interface Bewegungsprofil {
  art: Bewegungsart;
  /** false nur bei "bahn"/"flug" — "unbestimmt" lässt immer durch. */
  plausibel: boolean;
  /** Deutscher Klartext fürs UI; null, wenn nichts dagegen spricht. */
  begruendung: string | null;
  kennzahlen: Bewegungskennzahlen;
}

// --- Schwellen: Datengrundlage ---------------------------------------------

// Unterhalb dieser Grössen wird gar nicht geurteilt ("unbestimmt", und damit
// durchgelassen). Eine Handvoll Punkte über wenige hundert Meter trägt
// keine Aussage: dort sieht ein Rangiermanöver aus wie eine Bahnfahrt.
export const MIN_PUNKTE = 20;
export const MIN_DISTANZ_KM = 2;
export const MIN_BEWEGTZEIT_SEKUNDEN = 120;

// Fensterlänge für die Tempoberechnung. Einzelne GPS-Ausreisser (ein
// Sprung, ein schlechter Fix) verschwinden in einem 30-Sekunden-Mittel,
// während eine echte Reisegeschwindigkeit über Minuten stabil bleibt.
const FENSTER_SEKUNDEN = 30;

// Punkte mit schlechterer Genauigkeit fliessen nicht in die Tempostatistik
// ein — gleiche Schwelle wie MIN_ACCURACY_M im Recorder, hier bewusst
// dupliziert statt aus einer "use client"-Datei importiert.
const MAX_GENAUIGKEIT_M = 50;

// Tempo, oberhalb dessen ein Segment nicht mehr Bewegung, sondern ein
// Messfehler ist (Sprung ins Nichts und zurück). Bewusst über jeder
// Reisegeschwindigkeit eines Verkehrsflugzeugs: ein zu enger Filter würde
// bei dünner Abtastung echte, schnelle Segmente wegwerfen. Alles darunter
// bleibt drin und wird durch die Fenstermittelung entschärft — deshalb kann
// ein einzelner Ausreisser nie allein zu einem Verdikt führen.
const AUSREISSER_TEMPO_KMH = 1500;

// Grösste Lücke, über die hinweg die Linienführung noch als
// zusammenhängend gilt (Kurvigkeit). Gleiche Grenze wie MAX_JUMP_KM in
// lib/track.ts: was darüber liegt, ist Empfangsverlust oder Sprung und
// darf nicht als scharfer Knick in die Kurvigkeit eingehen.
const MAX_LUECKE_KM = MAX_JUMP_KM;

// --- Schwellen: Verdikte ---------------------------------------------------

// Flug. 300 km/h über zwei zusammengerechnete Minuten: kein Strassenfahrzeug
// hält das im öffentlichen Verkehr, auch nicht auf einer unbegrenzten
// Autobahn. Bewusst weit oberhalb jeder Auto-Höchstgeschwindigkeit, damit
// ein Messfehler bei Tempo 250 nicht als Flug endet.
export const FLUG_TEMPO_KMH = 300;
export const FLUG_MIN_SEKUNDEN = 120;

// Bahn. Alle vier Bedingungen müssen zusammen erfüllt sein:
//  - mehr als die Hälfte der Bewegtzeit über 140 km/h. Das Schweizer
//    Autobahnlimit liegt bei 120; mit GPS-Toleranz und zügiger Fahrweise
//    sind 130..140 noch erklärbar, dauerhaft darüber ist es der Zug (IC/ICE
//    fahren 140..200). Ein einzelner Überholvorgang fällt nicht ins
//    Gewicht, weil es um die halbe Bewegtzeit geht.
//  - mindestens 20 km und 10 Minuten in Bewegung: kurze Stücke sind zu
//    zufällig, um darauf eine Ablehnung zu stützen.
//  - höchstens 20 Grad Richtungsänderung je Kilometer. Das ist die
//    Absicherung gegen den teuersten Irrtum: eine kurvige Landstrasse oder
//    Passstrasse liegt um ein Vielfaches darüber und kann so nie als Bahn
//    gelten, egal wie schnell gefahren wurde.
export const BAHN_TEMPO_KMH = 140;
export const BAHN_MIN_ZEITANTEIL = 0.5;
export const BAHN_MIN_DISTANZ_KM = 20;
export const BAHN_MIN_BEWEGTZEIT_SEKUNDEN = 600;
export const BAHN_MAX_KURVIGKEIT_GRAD_PRO_KM = 20;

// Bewusst NICHT erkannt: S-Bahn und Regionalzug unter 140 km/h. Sie liessen
// sich nur über Merkmale fassen (Halte im Takt, gleichmässiges Tempo um
// 100 km/h), die eine Autobahnfahrt mit Stau ebenso erfüllt — und dieser
// Irrtum kostet eine echte Fahrt. Der Trade-off ist bewusst so gewählt.

// Abstand, auf den die Linie für die Kurvigkeit ausgedünnt wird. Bei
// dichter GPS-Abtastung zittert die Richtung von Punkt zu Punkt um zig Grad;
// erst über 500 m misst man die Linienführung statt des Rauschens.
const KURVIGKEIT_ABSTAND_M = 500;

interface Fenster {
  kmh: number;
  sekunden: number;
}

// Segmente zwischen aufeinanderfolgenden Punkten, ohne offensichtliche
// Ausreisser: Zeitstillstand/-rücklauf, unplausible Sprünge und (falls
// bekannt) zu ungenaue Fixes.
function saubereSegmente(punkte: BewegungsPunkt[]): { km: number; sekunden: number }[] {
  const segmente: { km: number; sekunden: number }[] = [];
  for (let i = 1; i < punkte.length; i++) {
    const vorher = punkte[i - 1];
    const jetzt = punkte[i];
    const sekunden = (jetzt.t - vorher.t) / 1000;
    if (sekunden <= 0) continue;
    if (
      (vorher.acc !== undefined && vorher.acc > MAX_GENAUIGKEIT_M) ||
      (jetzt.acc !== undefined && jetzt.acc > MAX_GENAUIGKEIT_M)
    ) {
      continue;
    }
    const km = haversineKm([vorher.lng, vorher.lat], [jetzt.lng, jetzt.lat]);
    if (km / (sekunden / 3600) > AUSREISSER_TEMPO_KMH) continue;
    segmente.push({ km, sekunden });
  }
  return segmente;
}

// Fasst Segmente zu Fenstern von mindestens FENSTER_SEKUNDEN zusammen. Erst
// dieses Mittel macht die Tempowerte gegen einzelne Fehlmessungen robust.
function fenster(segmente: { km: number; sekunden: number }[]): Fenster[] {
  const ergebnis: Fenster[] = [];
  let km = 0;
  let sekunden = 0;
  for (const segment of segmente) {
    km += segment.km;
    sekunden += segment.sekunden;
    if (sekunden >= FENSTER_SEKUNDEN) {
      ergebnis.push({ kmh: km / (sekunden / 3600), sekunden });
      km = 0;
      sekunden = 0;
    }
  }
  // Rest nur mitnehmen, wenn er überhaupt Zeit trägt — sein Gewicht in
  // allen Kennzahlen ist ohnehin seine Dauer.
  if (sekunden > 0) ergebnis.push({ kmh: km / (sekunden / 3600), sekunden });
  return ergebnis;
}

// Zeitgewichtetes Quantil über die Fenstertempi: ein langes Fenster zählt
// mehr als ein kurzes.
function quantil(fensterListe: Fenster[], anteil: number): number {
  if (fensterListe.length === 0) return 0;
  const sortiert = [...fensterListe].sort((a, b) => a.kmh - b.kmh);
  const gesamt = sortiert.reduce((summe, f) => summe + f.sekunden, 0);
  if (gesamt <= 0) return 0;
  let kumuliert = 0;
  for (const f of sortiert) {
    kumuliert += f.sekunden;
    if (kumuliert >= gesamt * anteil) return f.kmh;
  }
  return sortiert[sortiert.length - 1].kmh;
}

function peilungGrad([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// Aufsummierte Richtungsänderung je Kilometer auf der ausgedünnten Linie.
// Eine Passstrasse liegt hier bei mehreren hundert Grad/km, eine Autobahn
// im niedrigen zweistelligen Bereich, eine Bahnstrecke darunter.
function kurvigkeitGradProKm(punkte: BewegungsPunkt[]): number {
  const abstandKm = KURVIGKEIT_ABSTAND_M / 1000;
  const stuetzpunkte: [number, number][] = [];
  let letzter: [number, number] | null = null;
  let offen = 0;
  for (const punkt of punkte) {
    const koordinate: [number, number] = [punkt.lng, punkt.lat];
    if (letzter === null) {
      stuetzpunkte.push(koordinate);
      letzter = koordinate;
      continue;
    }
    const km = haversineKm(letzter, koordinate);
    // Lücken überspringen, statt sie als scharfen Knick in die Kurvigkeit
    // einzurechnen.
    if (km > MAX_LUECKE_KM) {
      letzter = koordinate;
      offen = 0;
      continue;
    }
    offen += km;
    letzter = koordinate;
    if (offen >= abstandKm) {
      stuetzpunkte.push(koordinate);
      offen = 0;
    }
  }

  if (stuetzpunkte.length < 3) return 0;

  let laengeKm = 0;
  let aenderungGrad = 0;
  let letztePeilung: number | null = null;
  for (let i = 1; i < stuetzpunkte.length; i++) {
    laengeKm += haversineKm(stuetzpunkte[i - 1], stuetzpunkte[i]);
    const peilung = peilungGrad(stuetzpunkte[i - 1], stuetzpunkte[i]);
    if (letztePeilung !== null) {
      aenderungGrad += Math.abs(((peilung - letztePeilung + 540) % 360) - 180);
    }
    letztePeilung = peilung;
  }
  if (laengeKm <= 0) return 0;
  return aenderungGrad / laengeKm;
}

function unbestimmt(kennzahlen: Bewegungskennzahlen): Bewegungsprofil {
  return { art: "unbestimmt", plausibel: true, begruendung: null, kennzahlen };
}

/**
 * Beurteilt, ob ein aufgezeichneter Trail von einem Strassenfahrzeug stammen
 * kann. Im Zweifel ("unbestimmt") immer plausibel — zu kurze oder zu dünne
 * Aufzeichnungen bekommen kein Verdikt.
 */
export function bewerteBewegungsprofil(punkte: BewegungsPunkt[]): Bewegungsprofil {
  const segmente = saubereSegmente(punkte);
  const fensterListe = fenster(segmente);
  const bewegteFenster = fensterListe.filter((f) => f.kmh >= MOVING_MIN_KMH);

  const distanzKm = segmente.reduce((summe, s) => summe + s.km, 0);
  const bewegtSekunden = bewegteFenster.reduce((summe, f) => summe + f.sekunden, 0);
  const sekundenUeberBahnTempo = bewegteFenster
    .filter((f) => f.kmh > BAHN_TEMPO_KMH)
    .reduce((summe, f) => summe + f.sekunden, 0);
  const sekundenUeberFlugTempo = fensterListe
    .filter((f) => f.kmh > FLUG_TEMPO_KMH)
    .reduce((summe, f) => summe + f.sekunden, 0);

  const kennzahlen: Bewegungskennzahlen = {
    punkte: punkte.length,
    distanzKm,
    bewegtSekunden: Math.round(bewegtSekunden),
    tempoMedianKmh: quantil(bewegteFenster, 0.5),
    tempoP95Kmh: quantil(bewegteFenster, 0.95),
    zeitanteilUeberBahnTempo: bewegtSekunden > 0 ? sekundenUeberBahnTempo / bewegtSekunden : 0,
    sekundenUeberFlugTempo: Math.round(sekundenUeberFlugTempo),
    kurvigkeitGradProKm: kurvigkeitGradProKm(punkte),
  };

  if (
    punkte.length < MIN_PUNKTE ||
    distanzKm < MIN_DISTANZ_KM ||
    bewegtSekunden < MIN_BEWEGTZEIT_SEKUNDEN
  ) {
    return unbestimmt(kennzahlen);
  }

  // Flug zuerst: eine Flugbewegung erfüllt auch die Bahn-Bedingungen, die
  // Begründung wäre dann aber die falsche.
  if (kennzahlen.sekundenUeberFlugTempo >= FLUG_MIN_SEKUNDEN) {
    return {
      art: "flug",
      plausibel: false,
      begruendung:
        `Diese Aufzeichnung sieht nach einem Flug aus: ${Math.round(kennzahlen.sekundenUeberFlugTempo / 60)} Minuten lang lag das Tempo über ${FLUG_TEMPO_KMH} km/h. ` +
        "Als Auto- oder Motorradfahrt lässt sie sich deshalb nicht speichern.",
      kennzahlen,
    };
  }

  if (
    distanzKm >= BAHN_MIN_DISTANZ_KM &&
    bewegtSekunden >= BAHN_MIN_BEWEGTZEIT_SEKUNDEN &&
    kennzahlen.zeitanteilUeberBahnTempo >= BAHN_MIN_ZEITANTEIL &&
    kennzahlen.kurvigkeitGradProKm <= BAHN_MAX_KURVIGKEIT_GRAD_PRO_KM
  ) {
    return {
      art: "bahn",
      plausibel: false,
      begruendung:
        `Diese Aufzeichnung sieht nach einer Zug- oder Bahnfahrt aus: über ${Math.round(distanzKm)} km lag das Tempo mehr als die Hälfte der Zeit über ${BAHN_TEMPO_KMH} km/h, und die Linienführung ist nahezu kurvenfrei. ` +
        "Als Auto- oder Motorradfahrt lässt sie sich deshalb nicht speichern.",
      kennzahlen,
    };
  }

  return { art: "strassenfahrzeug", plausibel: true, begruendung: null, kennzahlen };
}
