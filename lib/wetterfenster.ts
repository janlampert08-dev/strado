// Wetterfenster (Premium): an welchen Tagen der nächsten Woche eine Strecke
// fahrbar ist. Reine Logik ohne Server-Import — der Abruf steht in
// lib/weather.ts, das Zusammensetzen mit Strecke und Abo in
// lib/wetterfensterLaden.ts. So bleibt jede Schwelle hier prüfbar.
//
// Die Skala hat bewusst nur drei Stufen. Eine Tagesvorhersage ist eine
// Tagessumme über ein 1–2-km-Raster; wer daraus "73 % Fahrspass" macht,
// behauptet eine Genauigkeit, die das Modell nicht hat.
//
//   gut       trocken, keine Warnung — hier lohnt sich die Fahrt
//   moeglich  fahrbar, aber mit einem Vorbehalt (Schauer, Böen, kalt, …)
//   schlecht  Regen, Schnee, Sturm, Glätte über Tag — besser verschieben

import { haversineKm } from "@/lib/geo";
import type { FahrzeugTyp, HoehenprofilPunkt } from "@/types/database";

export type Fahrwetter = "gut" | "moeglich" | "schlecht";

export type WetterGrund =
  | "trocken"
  | "schauer"
  | "regen"
  | "gewitter"
  | "schnee"
  | "glaette"
  | "boeen"
  | "kalt"
  | "unbekannt";

/** Ein Tag aus der Open-Meteo-Tagesvorhersage, fehlende Werte als null. */
export interface TagesVorhersage {
  /** YYYY-MM-DD in Europe/Zurich, so wie Open-Meteo es liefert. */
  datum: string;
  wetterCode: number | null;
  niederschlagMm: number | null;
  niederschlagProzent: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  boeenKmh: number | null;
}

export interface Tagesurteil {
  datum: string;
  /** null = zu wenig Daten für ein Urteil. Nie still als "gut" gewertet. */
  stufe: Fahrwetter | null;
  grund: WetterGrund;
  /** Kurzer Satzteil, z. B. "trocken, 18°" oder "Schnee auf 2106 m". */
  text: string;
  /** Tageshöchstwert am Start, gerundet — die Zahl, die die Zelle zeigt. */
  tempMaxC: number | null;
  /** Das Urteil stammt vom höchsten Punkt, nicht vom Start. */
  vomHoechstenPunkt: boolean;
  /** Für die Rangfolge unter gleich guten Tagen (siehe besteTage). */
  niederschlagProzent: number | null;
}

// ---------------------------------------------------------------------------
// Schwellen
// ---------------------------------------------------------------------------
//
// Jede Zahl hier ist eine Entscheidung, keine Messung — deshalb stehen sie
// benannt an einem Ort und nicht verstreut in den Bedingungen.

/** Trocken heisst: kaum messbarer Niederschlag UND geringe Wahrscheinlichkeit.
 *  0.5 mm ist die Grenze, unter der eine Strasse nach einem Nieselschauer
 *  innert Minuten wieder abtrocknet; 30 % ist die Schwelle, ab der
 *  MeteoSchweiz selbst von "vereinzelten Schauern" spricht. */
export const TROCKEN_MAX_MM = 0.5;
export const TROCKEN_MAX_PROZENT = 30;

/** Regen (statt nur "Schauer möglich"): eine nennenswerte Menge, die auch
 *  wahrscheinlich fällt — oder eine so grosse Menge, dass die
 *  Wahrscheinlichkeit keine Rolle mehr spielt. Die Tagessumme stammt aus dem
 *  besten Einzelmodell, die Wahrscheinlichkeit aus dem Ensemble; erst beide
 *  zusammen sind belastbar. */
export const REGEN_AB_MM = 2;
export const REGEN_AB_PROZENT = 50;
export const REGEN_SICHER_AB_MM = 5;

/** Gewitter im Tagescode heisst oft nur "irgendwo am Nachmittag möglich".
 *  Erst mit hoher Wahrscheinlichkeit wird es zum Grund, nicht zu fahren. */
export const GEWITTER_SICHER_AB_PROZENT = 50;

/** Böen (km/h). Ab 60 zieht es ein Motorrad auf einer offenen Passhöhe
 *  spürbar zur Seite; ab 80 warnt MeteoSchweiz vor Sturm — das gilt auch
 *  im Auto (Äste, Anhänger, Seitenwind auf Brücken). */
export const BOEEN_WARNUNG_KMH = 60;
export const STURM_KMH = 80;

/** Unter 7 °C Tageshöchstwert erreicht ein Motorradreifen kaum Betriebs-
 *  temperatur, und die Hände werden nach einer halben Stunde steif. Fürs
 *  Auto kein Kriterium. */
export const KALT_MOTORRAD_MAX_C = 7;

/** Glätte: Frost in der Nacht heisst Reif oder Eis am Morgen, vor allem
 *  in schattigen Kehren. Bleibt es auch tagsüber bei höchstens 2 °C, taut es
 *  dort nicht mehr auf. */
export const FROST_MIN_C = 0;
export const DAUERFROST_MAX_C = 2;

/** Erst ab diesem Höhenunterschied lohnt der zweite Messpunkt: darunter
 *  liegen Start und höchster Punkt in derselben Rasterzelle des Modells
 *  bzw. derselben Wetterlage, und die Abfrage brächte nur Kosten. */
export const HOECHSTER_PUNKT_AB_M = 300;

// ---------------------------------------------------------------------------
// Klassifikation
// ---------------------------------------------------------------------------

const STUFENRANG: Record<Fahrwetter, number> = { gut: 0, moeglich: 1, schlecht: 2 };

// Bei gleicher Stufe gewinnt der Grund, der für die Fahrt am meisten zählt:
// Schnee sagt mehr als "kalt", auch wenn beide dieselbe Stufe tragen.
const GRUNDRANG: Record<WetterGrund, number> = {
  schnee: 8,
  glaette: 7,
  gewitter: 6,
  regen: 5,
  boeen: 4,
  schauer: 3,
  kalt: 2,
  trocken: 1,
  unbekannt: 0,
};

interface Befund {
  stufe: Fahrwetter;
  grund: WetterGrund;
  text: string;
}

function istSchneeCode(code: number): boolean {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

function istGewitterCode(code: number): boolean {
  return code >= 95 && code <= 99;
}

function gradText(c: number): string {
  return `${Math.round(c)}°`;
}

function schwerster(befunde: Befund[]): Befund {
  return befunde.reduce((a, b) => {
    const d = STUFENRANG[b.stufe] - STUFENRANG[a.stufe];
    if (d !== 0) return d > 0 ? b : a;
    return GRUNDRANG[b.grund] > GRUNDRANG[a.grund] ? b : a;
  });
}

/**
 * Ein Tag, ein Urteil. Das Motorrad ist strenger als das Auto: Kälte und
 * Böen sind dort ein Vorbehalt, Regen ein Grund, nicht zu fahren. Im Auto
 * ist Regen nur ein Vorbehalt — eine Aussichtsstrecke im Regen ist
 * schlechter, aber nicht gefährlicher.
 */
export function beurteileTag(tag: TagesVorhersage, fahrzeug: FahrzeugTyp): Tagesurteil {
  const motorrad = fahrzeug === "motorrad";
  const { wetterCode: code, niederschlagMm: mm, niederschlagProzent: prozent } = tag;
  const tempMaxC = tag.tempMaxC === null ? null : Math.round(tag.tempMaxC);

  const basis = {
    datum: tag.datum,
    tempMaxC,
    vomHoechstenPunkt: false,
    niederschlagProzent: prozent,
  };

  // Ohne Niederschlagsmenge UND ohne Wettercode lässt sich über "trocken"
  // nichts sagen. Lieber kein Urteil als ein erfundenes gutes.
  if (mm === null && code === null) {
    return { ...basis, stufe: null, grund: "unbekannt", text: "keine Daten" };
  }

  const befunde: Befund[] = [];

  // Niederschlag. Fehlt die Wahrscheinlichkeit, entscheidet die Menge allein;
  // fehlt die Menge, entscheidet der Code (ab 51 beschreibt er Niederschlag).
  const trocken =
    (mm !== null ? mm <= TROCKEN_MAX_MM : code === null || code < 51) &&
    (prozent === null || prozent < TROCKEN_MAX_PROZENT);

  if (code !== null && istSchneeCode(code) && !trocken) {
    befunde.push({ stufe: "schlecht", grund: "schnee", text: "Schnee" });
  } else if (code !== null && istGewitterCode(code) && !trocken) {
    const sicher = prozent !== null && prozent >= GEWITTER_SICHER_AB_PROZENT;
    befunde.push(
      sicher && motorrad
        ? { stufe: "schlecht", grund: "gewitter", text: "Gewitter" }
        : { stufe: "moeglich", grund: "gewitter", text: "Gewitter möglich" },
    );
  } else if (!trocken) {
    const regen =
      mm !== null &&
      (mm >= REGEN_SICHER_AB_MM ||
        (mm >= REGEN_AB_MM && (prozent === null || prozent >= REGEN_AB_PROZENT)));
    if (regen) {
      befunde.push({ stufe: motorrad ? "schlecht" : "moeglich", grund: "regen", text: "Regen" });
    } else {
      befunde.push({ stufe: "moeglich", grund: "schauer", text: "Schauer möglich" });
    }
  }

  // Glätte. Dauerfrost ist für beide ein Grund, nicht zu fahren; Frost nur
  // in der Nacht betrifft vor allem den Morgen.
  if (tag.tempMinC !== null && tag.tempMinC <= FROST_MIN_C) {
    if (tag.tempMaxC !== null && tag.tempMaxC <= DAUERFROST_MAX_C) {
      befunde.push({ stufe: "schlecht", grund: "glaette", text: "Glätte" });
    } else {
      befunde.push({ stufe: "moeglich", grund: "glaette", text: "Glätte möglich" });
    }
  }

  // Wind.
  if (tag.boeenKmh !== null) {
    if (tag.boeenKmh >= STURM_KMH) {
      befunde.push({ stufe: motorrad ? "schlecht" : "moeglich", grund: "boeen", text: "Sturmböen" });
    } else if (motorrad && tag.boeenKmh >= BOEEN_WARNUNG_KMH) {
      befunde.push({ stufe: "moeglich", grund: "boeen", text: "starke Böen" });
    }
  }

  // Kälte (nur Motorrad).
  if (motorrad && tag.tempMaxC !== null && tag.tempMaxC < KALT_MOTORRAD_MAX_C) {
    befunde.push({ stufe: "moeglich", grund: "kalt", text: `kalt, ${gradText(tag.tempMaxC)}` });
  }

  if (befunde.length === 0) {
    return {
      ...basis,
      stufe: "gut",
      grund: "trocken",
      text: tempMaxC === null ? "trocken" : `trocken, ${gradText(tempMaxC)}`,
    };
  }

  return { ...basis, ...schwerster(befunde) };
}

/**
 * Start und höchster Punkt zu einem Urteil pro Tag. Es zählt der schlechtere
 * der beiden: wer über den Pass will, muss auch oben durch. Die Temperatur
 * bleibt die vom Start — dieselbe Stelle, von der die Zeile "Wetter" auf der
 * Streckenseite spricht; die Kälte oben erscheint als Grund, wenn sie zählt.
 */
export function kombiniereTage(
  start: Tagesurteil[],
  hoechster: Tagesurteil[] | null,
  hoeheM: number | null,
): Tagesurteil[] {
  if (!hoechster || hoeheM === null) return start;
  const oben = new Map(hoechster.map((t) => [t.datum, t]));

  return start.map((s) => {
    const h = oben.get(s.datum);
    if (!h || h.stufe === null) return s;
    // Fehlt am START das Urteil, bleibt der Tag ohne Urteil — auch wenn es
    // oben gut aussieht. Vorher übernahm er in diesem Fall die Stufe des
    // höchsten Punkts, und damit stand eine als "trocken, 18°" gelesene
    // Zelle über einer Temperatur, die "—" zeigt: ein gutes Urteil aus
    // Daten, die es nicht gibt. Genau das verhindert beurteileTag() eine
    // Ebene tiefer ("lieber kein Urteil als ein erfundenes gutes").
    if (s.stufe === null) return s;
    const obenSchlechter =
      STUFENRANG[h.stufe] > STUFENRANG[s.stufe] ||
      (h.stufe === s.stufe && h.stufe !== "gut" && GRUNDRANG[h.grund] > GRUNDRANG[s.grund]);
    if (!obenSchlechter) return s;
    return {
      ...s,
      stufe: h.stufe,
      grund: h.grund,
      text: `${h.text} auf ${hoeheM} m`,
      vomHoechstenPunkt: true,
      niederschlagProzent: h.niederschlagProzent ?? s.niederschlagProzent,
    };
  });
}

/**
 * Die besten Tage der Woche, höchstens `anzahl`.
 *
 * Empfohlen wird nur, was "gut" ist. Gibt es diese Woche keinen guten Tag,
 * ist die ehrliche Antwort eine leere Liste — nicht der am wenigsten
 * schlechte Tag, der dann als Empfehlung dastünde.
 *
 * Unter gleich guten Tagen: geringere Regenwahrscheinlichkeit zuerst, dann
 * der wärmere (bis 25 °C — darüber ist wärmer nicht besser), dann der
 * frühere. Die letzte Regel macht das Ergebnis bei Gleichstand eindeutig.
 */
export function besteTage(urteile: Tagesurteil[], anzahl = 2): Tagesurteil[] {
  const komfort = (t: Tagesurteil) => Math.min(t.tempMaxC ?? 0, 25);
  return urteile
    .filter((t) => t.stufe === "gut")
    .sort(
      (a, b) =>
        (a.niederschlagProzent ?? 0) - (b.niederschlagProzent ?? 0) ||
        komfort(b) - komfort(a) ||
        a.datum.localeCompare(b.datum),
    )
    .slice(0, anzahl)
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

// ---------------------------------------------------------------------------
// Open-Meteo-Antwort
// ---------------------------------------------------------------------------

export const OPEN_METEO_TAGESFELDER = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_gusts_10m_max",
] as const;

function zahl(wert: unknown): number | null {
  return typeof wert === "number" && Number.isFinite(wert) ? wert : null;
}

function spalte(daily: Record<string, unknown>, feld: string, i: number): number | null {
  const werte = daily[feld];
  return Array.isArray(werte) ? zahl(werte[i]) : null;
}

/**
 * Liest die Tagesvorhersage aus einer Open-Meteo-Antwort. Mit mehreren
 * Koordinaten liefert Open-Meteo ein Array, mit einer ein einzelnes Objekt —
 * zurück kommt immer eine Liste pro Ort, in Abfragereihenfolge. Die Antwort
 * ist Fremdinput: was nicht die erwartete Form hat, wird zu null bzw. zu
 * einer leeren Tagesliste, nie zu einer Ausnahme.
 */
export function leseOpenMeteo(json: unknown): TagesVorhersage[][] {
  const orte = Array.isArray(json) ? json : [json];
  return orte.map((ort) => {
    const daily = (ort as { daily?: unknown } | null)?.daily;
    if (!daily || typeof daily !== "object") return [];
    const d = daily as Record<string, unknown>;
    if (!Array.isArray(d.time)) return [];
    return d.time.flatMap((datum, i): TagesVorhersage[] =>
      typeof datum === "string" && /^\d{4}-\d{2}-\d{2}$/.test(datum)
        ? [
            {
              datum,
              wetterCode: spalte(d, "weather_code", i),
              niederschlagMm: spalte(d, "precipitation_sum", i),
              niederschlagProzent: spalte(d, "precipitation_probability_max", i),
              tempMaxC: spalte(d, "temperature_2m_max", i),
              tempMinC: spalte(d, "temperature_2m_min", i),
              boeenKmh: spalte(d, "wind_gusts_10m_max", i),
            },
          ]
        : [],
    );
  });
}

/**
 * Wirft Tage vor `heute` weg. Die Antwort ist bis zu einer Stunde gecacht
 * (lib/weather.ts); kurz nach Mitternacht stünde sonst gestern als erster
 * Tag der Woche da.
 */
export function abHeute<T extends { datum: string }>(tage: T[], heute: string): T[] {
  return tage.filter((t) => t.datum >= heute);
}

/** Heutiges Datum in der Schweiz als YYYY-MM-DD, unabhängig von der
 *  Zeitzone des Servers (Vercel läuft in UTC). */
export function heuteInZuerich(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(jetzt);
}

// ---------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------

const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WOCHENTAGE_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// Über den Kalendertag gerechnet, nicht über new Date("YYYY-MM-DD"): das
// wäre UTC-Mitternacht und in jeder Zone westlich davon der Vortag.
function wochentagIndex(datum: string): number {
  const [j, m, t] = datum.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t)).getUTCDay();
}

export function wochentagKurz(datum: string): string {
  return WOCHENTAGE_KURZ[wochentagIndex(datum)];
}

export function wochentagLang(datum: string): string {
  return WOCHENTAGE_LANG[wochentagIndex(datum)];
}

const STUFENTEXT: Record<Fahrwetter, string> = {
  gut: "gut",
  moeglich: "mit Vorbehalt",
  schlecht: "schlecht",
};

/** Der ganze Tag als ein Satz — für Screenreader, die die Zelle nicht sehen. */
export function tagVorlesen(urteil: Tagesurteil, istHeute: boolean): string {
  const tag = istHeute ? "Heute" : wochentagLang(urteil.datum);
  if (urteil.stufe === null) return `${tag}: keine Daten`;
  // Die Temperatur nur anhängen, wo der Grund sie nicht schon nennt
  // ("trocken, 18°", "kalt, 5°").
  const temp =
    urteil.tempMaxC !== null && !urteil.text.includes("°") ? `, bis ${urteil.tempMaxC}°` : "";
  return `${tag}: ${STUFENTEXT[urteil.stufe]}, ${urteil.text}${temp}`;
}

/** "Samstag", "Samstag und Sonntag" — die Zusammenfassung unter dem Streifen. */
export function tageAufzaehlen(tage: Tagesurteil[], heute: string, kurz = false): string {
  const namen = tage.map((t) =>
    t.datum === heute ? "heute" : kurz ? wochentagKurz(t.datum) : wochentagLang(t.datum),
  );
  if (kurz) return namen.join(", ");
  if (namen.length <= 1) return namen.join("");
  return `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Höchster Punkt
// ---------------------------------------------------------------------------

/**
 * Koordinate und Höhe des höchsten Punkts einer Strecke — oder null, wenn er
 * sich für eine zweite Abfrage nicht lohnt (siehe HOECHSTER_PUNKT_AB_M).
 *
 * Das Höhenprofil kennt nur Kilometer und Meter, keine Koordinaten. Die
 * Stelle wird deshalb auf der Geometrie abgeschritten, bis die kumulierte
 * Distanz den Kilometer des Gipfels erreicht. Das Profil misst eben
 * (swisstopo, LV95), hier wird über die Kugel gerechnet; der Unterschied
 * liegt weit unter der Rasterweite des Wettermodells.
 */
export function hoechsterPunkt(
  koordinaten: [number, number][],
  profil: HoehenprofilPunkt[] | null,
): { koordinate: [number, number]; hoeheM: number; startM: number } | null {
  if (!profil || profil.length < 2 || koordinaten.length < 2) return null;
  const startM = profil[0].m;
  const gipfel = profil.reduce((a, b) => (b.m > a.m ? b : a));
  if (gipfel.m - startM < HOECHSTER_PUNKT_AB_M) return null;

  let km = 0;
  for (let i = 1; i < koordinaten.length; i++) {
    km += haversineKm(koordinaten[i - 1], koordinaten[i]);
    if (km >= gipfel.km) return { koordinate: koordinaten[i], hoeheM: gipfel.m, startM };
  }
  return { koordinate: koordinaten[koordinaten.length - 1], hoeheM: gipfel.m, startM };
}

// ---------------------------------------------------------------------------
// Fahrzeug
// ---------------------------------------------------------------------------

/**
 * Nach welchem Massstab beurteilt wird. Wer ein Motorrad in der Garage hat,
 * bekommt den strengeren — auch wenn daneben ein Auto steht: ein Tag, der
 * fürs Motorrad gut ist, ist es auch fürs Auto, umgekehrt nicht. Ohne
 * Fahrzeug ebenfalls der strengere, aus demselben Grund.
 */
export function wetterMassstab(fahrzeugtypen: FahrzeugTyp[]): FahrzeugTyp {
  return fahrzeugtypen.length > 0 && fahrzeugtypen.every((t) => t === "auto") ? "auto" : "motorrad";
}
