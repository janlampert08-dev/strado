import { haversineKm, type TrailPoint } from "@/lib/geo";
import { interpolateElevation } from "@/lib/elevation";
import { MAX_JUMP_KM, MOVING_MIN_KMH } from "@/lib/track";
import { motorklasseFor } from "@/lib/motorklassen";
import type { FahrzeugTyp, Motorklasse } from "@/types/database";

// Aus einem aufgezeichneten GPS-Trail ableiten, welche Motorleistung die
// Fahrt MINDESTENS gebraucht hat — und daraus, in welcher Motorklasse sie
// mindestens gefahren sein muss.
//
// Reine Funktion ohne I/O, nach demselben Muster wie
// lib/bewegungsprofil.ts: derselbe Code kann im Browser laufen und läuft
// serverseitig in lib/actions/completions.ts, wo das Ergebnis nach
// route_completions.motorklasse_belegt geschrieben wird.
//
// DIE ENTSCHEIDENDE EIGENSCHAFT: Das Ergebnis wirkt ausschliesslich NACH
// OBEN (siehe hoehereKlasse in lib/motorklassen.ts und die generierte Spalte
// motorklasse_gewertet in 0080). Dass jemand schneller war, als seine Klasse
// hergibt, ist ein physikalischer Widerspruch; dass jemand langsamer war,
// beweist nichts — Verkehr, Nässe, Vorsicht, eine gemütliche Runde. Deshalb
// kann diese Prüfung keine ehrliche Fahrt schlechter stellen: sie schiebt
// einen falsch deklarierten Porsche in die Klasse, in die er gehört, und
// lässt alles andere unberührt.
//
// Daraus folgt die Grundhaltung für jede Konstante hier: Wo ein Wert
// unbekannt ist, wird er so gewählt, dass die geschätzte Leistung ZU NIEDRIG
// herauskommt. Ein leichtes Fahrzeug, eine schlanke Stirnfläche, dünne Luft,
// ein verlustarmer Antrieb. Erst wenn selbst unter diesen günstigsten
// Annahmen mehr Leistung nötig war, als die deklarierte Klasse hergibt, ist
// die Deklaration widerlegt.
//
// Was das kostet, ehrlich benannt: Der Nachweis ist grob. Für A1 (11 kW)
// lässt sich unter diesen Annahmen erst oberhalb von rund 135 km/h Dauertempo
// in der Ebene etwas beweisen — ein echter 125er läuft bei 100 bis 110. In
// dieser Lücke bleibt eine Falschangabe unentdeckt. Die Ergänzung dazu ist
// der klassenabhängige Deckel auf das DURCHSCHNITTSTEMPO in
// set_motorklasse() (0080): Der greift auf jedem Schreibpfad und fasst genau
// den anderen Fall — dauerhaft zu schnell über die ganze Fahrt statt in der
// Spitze. Zusammen decken die beiden die zwei Formen ab; einzeln keine.

export interface KlassenbelegKennzahlen {
  /** Fenster, die überhaupt in die Bewertung eingingen. */
  fenster: number;
  /** Zeitgewichtetes 95%-Quantil der Fenstertempi in Bewegung. */
  tempoP95Kmh: number;
  /** Die nachgewiesene Dauerleistung in kW (siehe NACHWEIS_SEKUNDEN). */
  leistungKw: number;
  /** Höchste in einem einzelnen Fenster geschätzte Leistung — nur Diagnose. */
  spitzenleistungKw: number;
  /** Ob ein Höhenprofil vorlag und der Hangabtrieb mitgerechnet wurde. */
  mitSteigung: boolean;
}

export interface Klassenbeleg {
  /**
   * Die belegte Klasse, oder null wenn die Aufzeichnung keine Aussage
   * trägt (zu kurz, zu wenige Punkte, kein Fahrzeugtyp).
   */
  klasse: Motorklasse | null;
  kennzahlen: KlassenbelegKennzahlen;
}

// --- Fahrzeugannahmen ------------------------------------------------------
//
// Jeweils das LEICHTESTE/WINDSCHLÜPFRIGSTE plausible Fahrzeug seiner Art,
// nicht der Durchschnitt: siehe die Begründung oben. Masse inklusive Fahrer.
const ANNAHMEN: Record<FahrzeugTyp, { masseKg: number; cdA: number; crr: number }> = {
  // 125er-Roller (rund 120 kg) plus leichter Fahrer. Ein cwA von 0.45 m²
  // entspricht einem angelegten Fahrer auf einem kleinen Motorrad.
  motorrad: { masseKg: 180, cdA: 0.45, crr: 0.01 },
  // Ein Kleinwagen (Panda, Up) mit Fahrer. Ein grösseres Auto braucht mehr
  // Leistung — genau deshalb steht hier der kleine Wert.
  auto: { masseKg: 1000, cdA: 0.55, crr: 0.009 },
};

const G = 9.81;
// Luftdichte auf etwa 1000 m ü. M. statt 1.225 auf Meereshöhe: Strado
// zeichnet Bergstrassen auf, und dünnere Luft bedeutet weniger Widerstand
// und damit weniger nötige Leistung.
const LUFTDICHTE = 1.0;
// Antriebsstrangwirkungsgrad. Hoch angesetzt: je weniger Verlust
// unterstellt wird, desto weniger Motorleistung erklärt dieselbe Fahrt.
const WIRKUNGSGRAD = 0.95;

// --- Fenster und Rauschgrenzen ---------------------------------------------

// Fensterlänge. Kürzer als die 30 s in bewegungsprofil.ts, weil hier auch
// Beschleunigung gemessen wird und die über 30 s verschwindet; länger als
// ein einzelner Fix, damit GPS-Rauschen sich herausmittelt. Zusätzlich eine
// Mindestlänge in Metern, damit ein Fenster im Stillstand keine
// Scheingenauigkeit erzeugt.
const FENSTER_SEKUNDEN = 10;
const FENSTER_MIN_M = 80;

// Punkte mit schlechterer Genauigkeit fliessen nicht ein — gleiche Schwelle
// wie MIN_ACCURACY_M im Recorder und wie in bewegungsprofil.ts.
const MAX_GENAUIGKEIT_M = 50;

// Segmenttempo, oberhalb dessen ein Sprung vorliegt statt Bewegung.
const AUSREISSER_TEMPO_KMH = 300;

// Obergrenzen gegen GPS-Rauschen. Eine gemessene Beschleunigung über
// 4 m/s² über zehn Sekunden hat kein Strassenfahrzeug im Verkehr; eine
// Steigung über 15 % hat kaum eine Passstrasse. Beide Deckel verhindern,
// dass ein einzelner Ausreisser die geschätzte Leistung hochtreibt.
const MAX_BESCHLEUNIGUNG_MS2 = 4;
const MAX_STEIGUNG = 0.15;

// Unterhalb dieser Steigung wird der Hangabtrieb ignoriert: in dem Bereich
// ist die Differenz zweier Höhenwerte Rauschen, und ihr Beitrag zur
// Leistung ist ohnehin klein.
const MIN_STEIGUNG = 0.02;

// Wie lange die Leistung mindestens gehalten worden sein muss, damit sie
// als nachgewiesen gilt. Ein einzelnes Fenster könnte ein Messfehler sein;
// eine halbe Minute zusammengerechnet ist es nicht.
const NACHWEIS_SEKUNDEN = 30;

// Mindestgrösse der Aufzeichnung, analog zu bewegungsprofil.ts. Darunter
// gibt es kein Urteil — und "kein Urteil" heisst hier: keine Hochstufung.
const MIN_PUNKTE = 20;
const MIN_DISTANZ_KM = 1;
const MIN_BEWEGTZEIT_SEKUNDEN = 120;

interface Fenster {
  kmh: number;
  sekunden: number;
  meter: number;
  /** Kumulierte Distanz ab Start am Fensteranfang bzw. -ende, in km. */
  vonKm: number;
  bisKm: number;
}

interface Punkt {
  lng: number;
  lat: number;
  t: number;
  acc?: number;
}

// Fenster von mindestens FENSTER_SEKUNDEN und FENSTER_MIN_M bilden, unter
// Auslassung offensichtlicher Ausreisser (Zeitstillstand, Sprünge, zu
// ungenaue Fixes).
function fensterBilden(punkte: Punkt[]): Fenster[] {
  const fenster: Fenster[] = [];
  let km = 0;
  let sekunden = 0;
  let kumuliertKm = 0;
  let vonKm = 0;

  for (let i = 1; i < punkte.length; i++) {
    const vorher = punkte[i - 1];
    const jetzt = punkte[i];
    const dt = (jetzt.t - vorher.t) / 1000;
    if (dt <= 0) continue;
    if (
      (vorher.acc !== undefined && vorher.acc > MAX_GENAUIGKEIT_M) ||
      (jetzt.acc !== undefined && jetzt.acc > MAX_GENAUIGKEIT_M)
    ) {
      continue;
    }
    const dkm = haversineKm([vorher.lng, vorher.lat], [jetzt.lng, jetzt.lat]);
    if (dkm > MAX_JUMP_KM) continue;
    if (dkm / (dt / 3600) > AUSREISSER_TEMPO_KMH) continue;

    km += dkm;
    sekunden += dt;
    kumuliertKm += dkm;

    if (sekunden >= FENSTER_SEKUNDEN && km * 1000 >= FENSTER_MIN_M) {
      fenster.push({
        kmh: km / (sekunden / 3600),
        sekunden,
        meter: km * 1000,
        vonKm,
        bisKm: kumuliertKm,
      });
      km = 0;
      sekunden = 0;
      vonKm = kumuliertKm;
    }
  }

  return fenster;
}

/**
 * Nötige Motorleistung in kW für ein Fenster.
 *
 * P = ( (Hangabtrieb + Rollwiderstand + Beschleunigung) · v + Luftwiderstand )
 *     / Wirkungsgrad
 *
 * Der Luftwiderstand geht mit v³ ein und dominiert bei hohem Tempo; die
 * Beschleunigung dominiert beim Herausbeschleunigen aus einer Kurve. Genau
 * dieser zweite Term ist es, der einen Sportwagen verrät, auch wenn er nie
 * besonders schnell wird: ein 125er kann eine Tonne Masse nicht auf
 * Landstrassentempo katapultieren.
 */
function leistungKw(
  typ: FahrzeugTyp,
  tempoMs: number,
  beschleunigungMs2: number,
  steigung: number,
): number {
  const { masseKg, cdA, crr } = ANNAHMEN[typ];
  const winkel = Math.atan(steigung);
  const hangabtrieb = masseKg * G * Math.sin(winkel);
  const rollwiderstand = masseKg * G * crr * Math.cos(winkel);
  const beschleunigung = masseKg * beschleunigungMs2;
  const luftwiderstand = 0.5 * LUFTDICHTE * cdA * tempoMs * tempoMs;

  const watt =
    ((hangabtrieb + rollwiderstand + beschleunigung + luftwiderstand) * tempoMs) / WIRKUNGSGRAD;
  return watt / 1000;
}

// Zeitgewichtetes Quantil über die Fenstertempi.
function quantil(fenster: Fenster[], anteil: number): number {
  if (fenster.length === 0) return 0;
  const sortiert = [...fenster].sort((a, b) => a.kmh - b.kmh);
  const gesamt = sortiert.reduce((s, f) => s + f.sekunden, 0);
  if (gesamt <= 0) return 0;
  let kumuliert = 0;
  for (const f of sortiert) {
    kumuliert += f.sekunden;
    if (kumuliert >= gesamt * anteil) return f.kmh;
  }
  return sortiert[sortiert.length - 1].kmh;
}

function ohneUrteil(kennzahlen: KlassenbelegKennzahlen): Klassenbeleg {
  return { klasse: null, kennzahlen };
}

/**
 * Beurteilt, welche Motorklasse eine Fahrt mindestens verlangt hat.
 *
 * @param typ           Fahrzeugtyp des benutzten Fahrzeugs. Bestimmt die
 *                      Masse- und Widerstandsannahmen und die Klassenskala.
 * @param punkte        Der rohe GPS-Trail mit Zeitstempeln.
 * @param hoehenprofil  Optional das Höhenprofil der Fahrt ({km, m}), wie es
 *                      deriveElevation() in lib/actions/completions.ts
 *                      ohnehin schon berechnet. Fehlt es (swisstopo kennt
 *                      nur Schweizer Koordinaten und kann ausfallen), wird
 *                      die Fahrt als flach gerechnet — was die geschätzte
 *                      Leistung senkt und damit auf der sicheren Seite liegt.
 */
export function belegeMotorklasse(
  typ: FahrzeugTyp,
  punkte: TrailPoint[],
  hoehenprofil?: { km: number; m: number }[] | null,
): Klassenbeleg {
  const fenster = fensterBilden(punkte as Punkt[]);
  const bewegt = fenster.filter((f) => f.kmh >= MOVING_MIN_KMH);
  const distanzKm = fenster.reduce((s, f) => s + f.meter / 1000, 0);
  const bewegtSekunden = bewegt.reduce((s, f) => s + f.sekunden, 0);

  const leerlauf: KlassenbelegKennzahlen = {
    fenster: bewegt.length,
    tempoP95Kmh: quantil(bewegt, 0.95),
    leistungKw: 0,
    spitzenleistungKw: 0,
    mitSteigung: false,
  };

  if (
    punkte.length < MIN_PUNKTE ||
    distanzKm < MIN_DISTANZ_KM ||
    bewegtSekunden < MIN_BEWEGTZEIT_SEKUNDEN
  ) {
    return ohneUrteil(leerlauf);
  }

  const nutzeSteigung = Array.isArray(hoehenprofil) && hoehenprofil.length >= 2;

  // Die kumulierten Distanzen der Fenster stammen aus den Rohpunkten, das
  // Höhenprofil dagegen aus dem vereinfachten Track. Beide Längen weichen
  // leicht voneinander ab (Vereinfachung kürzt, GPS-Rauschen verlängert),
  // deshalb ein einzelner Massstabsfaktor statt einer Punkt-zu-Punkt-
  // Zuordnung. Ein Restversatz bleibt — er wird durch MAX_STEIGUNG und die
  // Mindestfensterlänge aufgefangen und kann keine steile Rampe erfinden,
  // die es nirgends gibt.
  const profilLaengeKm = nutzeSteigung ? hoehenprofil[hoehenprofil.length - 1].km : 0;
  const massstab = nutzeSteigung && distanzKm > 0 ? profilLaengeKm / distanzKm : 1;

  const bewertet: { kw: number; sekunden: number }[] = [];

  for (let i = 0; i < fenster.length; i++) {
    const f = fenster[i];
    if (f.kmh < MOVING_MIN_KMH) continue;

    const tempoMs = f.kmh / 3.6;

    // Beschleunigung gegenüber dem vorigen Fenster. Nur positive Werte:
    // Bremsen verlangt keine Motorleistung.
    let beschleunigung = 0;
    const vorher = fenster[i - 1];
    if (vorher && vorher.sekunden > 0) {
      const dv = tempoMs - vorher.kmh / 3.6;
      const dt = (f.sekunden + vorher.sekunden) / 2;
      if (dt > 0 && dv > 0) {
        beschleunigung = Math.min(dv / dt, MAX_BESCHLEUNIGUNG_MS2);
      }
    }

    let steigung = 0;
    if (nutzeSteigung && f.meter > 0) {
      const vonM = interpolateElevation(hoehenprofil, f.vonKm * massstab);
      const bisM = interpolateElevation(hoehenprofil, f.bisKm * massstab);
      if (vonM !== null && bisM !== null) {
        const roh = (bisM - vonM) / f.meter;
        steigung = roh < MIN_STEIGUNG ? 0 : Math.min(roh, MAX_STEIGUNG);
      }
    }

    bewertet.push({
      kw: leistungKw(typ, tempoMs, beschleunigung, steigung),
      sekunden: f.sekunden,
    });
  }

  if (bewertet.length === 0) return ohneUrteil(leerlauf);

  // Nachgewiesene Dauerleistung: von der höchsten Fensterleistung abwärts
  // Sekunden aufsummieren, bis NACHWEIS_SEKUNDEN zusammenkommen. Der Wert,
  // bei dem das erreicht ist, wurde mindestens so lange gehalten. Kommt die
  // Fahrt insgesamt nicht auf so viel Bewegtzeit, greift der Mindestgrössen-
  // Test oben schon vorher.
  const absteigend = [...bewertet].sort((a, b) => b.kw - a.kw);
  let sekunden = 0;
  let nachgewiesen = 0;
  for (const eintrag of absteigend) {
    nachgewiesen = eintrag.kw;
    sekunden += eintrag.sekunden;
    if (sekunden >= NACHWEIS_SEKUNDEN) break;
  }
  if (sekunden < NACHWEIS_SEKUNDEN) return ohneUrteil(leerlauf);

  const kennzahlen: KlassenbelegKennzahlen = {
    fenster: bewertet.length,
    tempoP95Kmh: Number(quantil(bewegt, 0.95).toFixed(1)),
    leistungKw: Number(nachgewiesen.toFixed(1)),
    spitzenleistungKw: Number(absteigend[0].kw.toFixed(1)),
    mitSteigung: nutzeSteigung,
  };

  // Dieselbe Formel wie für die deklarierte Klasse — der geschätzte
  // Leistungswert wird behandelt wie eine Herstellerangabe. hubraum_ccm
  // bleibt bewusst offen: aus einem Trail lässt sich kein Hubraum ablesen,
  // und motorklasseFor() wertet ein fehlendes ccm als A1-fähig, also als die
  // NIEDRIGSTE Klasse — wieder die sichere Richtung.
  return {
    klasse: motorklasseFor({ typ, hubraum_ccm: null, leistung_kw: nachgewiesen }),
    kennzahlen,
  };
}
