export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Dauer mit Einheit: "15:27 min", "1:05:12 h". formatDuration allein las
// sich neben einem Datum wie eine Uhrzeit ("21.09.2026 · 15:27") — und ob
// "14:12" Minuten oder Stunden meint, stand nirgends. Die Stoppuhr auf dem
// Aufzeichnungsschirm bleibt ohne Einheit: dort läuft sie sichtbar, und
// eine laufende Uhr liest niemand als Tageszeit.
//
// Wert und Einheit getrennt, weil Kennzahl-Kacheln die Einheit kleiner
// setzen als die Zahl.
export function dauerTeile(totalSeconds: number): { wert: string; einheit: "min" | "h" } {
  return { wert: formatDuration(totalSeconds), einheit: totalSeconds >= 3600 ? "h" : "min" };
}

// Zahl und Einheit hängen mit einem geschützten Leerzeichen (\u00a0)
// zusammen: In schmalen Spalten brach "15:27" sonst am Zeilenende um und
// "min" stand allein auf der nächsten Zeile. Gilt für jede Angabe mit
// Einheit in dieser Datei.
export function formatDauer(totalSeconds: number): string {
  const { wert, einheit } = dauerTeile(totalSeconds);
  return `${wert}\u00a0${einheit}`;
}

// Höhe in Metern mit Schweizer Tausendertrennung: "2’315 m". Dieselbe
// Passhöhe stand auf der Passkarte als "2'315 m" und drei Zentimeter tiefer
// als "Höchster Punkt 2308 m" — zwei Schreibweisen lesen sich wie zwei
// verschiedene Angaben.
export function formatMeter(meter: number): string {
  return `${Math.round(meter).toLocaleString("de-CH")}\u00a0m`;
}

// laenge_km kommt bei serverseitig aus der Route-Geometrie berechneten
// Strecken (ST_Length, siehe propose_route_full) mit voller Float-Präzision
// aus der DB — ungerundet für die Anzeige ungeeignet.
export function formatKm(laengeKm: number): string {
  return laengeKm.toFixed(1);
}

// Ganze Kilometer für die Startseite (Streckenliste, Signatur-Label): dort
// ist die Länge eine Grössenordnung zum Überfliegen, keine Messung.
export function formatKmGerundet(laengeKm: number): string {
  return String(Math.round(laengeKm));
}

// Datum, wie es in der Oberfläche steht: 08.09.2026. Bisher stand dieselbe
// Formatierung wortgleich in zwei Komponenten (PremiumCard, dann auch
// PremiumWillkommen) — beide zeigen Abo-Daten, und ein Abo-Datum, das an
// zwei Stellen unterschiedlich aussieht, liest sich wie zwei verschiedene
// Angaben.
//
// Feste Locale statt der des Browsers: das Publikum ist die Schweiz, und
// eine Laufzeit ohne vollständige Locale-Daten (oder ein Server in einer
// anderen Region) soll nicht plötzlich 9/8/2026 zeigen — schon gar nicht
// unterschiedlich auf Server und Client, was React als Hydrationsfehler
// meldet.
export function datumCH(d: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

// Kalenderdatum (YYYY-MM-DD) in der Zeitzone Europe/Zurich statt UTC — für
// eine Fahrt, die spätabends oder früh morgens Ortszeit eingetragen wird,
// weicht das UTC-Datum sonst um einen Tag vom tatsächlichen lokalen Tag ab
// (z.B. 00:30 Uhr CEST im Sommer ist noch 22:30 Uhr UTC des Vortags).
// en-CA formatiert direkt als YYYY-MM-DD, ohne die Teile manuell wieder
// zusammensetzen zu müssen.
// Mit Argument das Kalenderdatum eines beliebigen Zeitpunkts, etwa des
// ersten Punkts einer importierten Fahrt.
export function todayInZurich(zeitpunkt: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(zeitpunkt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Einzahl/Mehrzahl. Klingt nach Kleinkram, stand aber live auf dem
// Teilen-Bild: "1 Pässe befahren" — ausgerechnet auf dem Artefakt, das ein
// Nicht-Nutzer als erstes von Strado sieht. Dieselbe Stelle traf die
// Bestenliste ("1 Fahrten", "1 Strecken") und die Auszeichnungen.
//
// Der Fehler war eingebaut, kein Randfall: PASS_MILESTONES und
// FAHRTEN_MILESTONES (lib/achievements.ts) beginnen beide bei 1, die erste
// Auszeichnung überhaupt ist also die falsch beschriftete.
//
// Die Fallunterscheidung gab es im Code schon fünfmal — in Moderation,
// Creator-Codes, ActivityHeatmap, Header (Kudos) und useRideRecorder —
// jedes Mal anders geschrieben. Hier einmal, damit die sechste Stelle sie
// nicht erneut erfindet und die siebte sie wieder vergisst.
export function nomen(anzahl: number, eins: string, mehr: string): string {
  return anzahl === 1 ? eins : mehr;
}

// "1 Fahrt" / "10 Fahrten" — Zahl und Nomen zusammen, in Schweizer
// Schreibweise (1'380), passend zum Rest dieser Datei.
export function mitAnzahl(anzahl: number, eins: string, mehr: string): string {
  return `${anzahl.toLocaleString("de-CH")} ${nomen(anzahl, eins, mehr)}`;
}
