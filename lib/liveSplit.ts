// Live-Abstand zur Bestzeit während einer Streckenfahrt.
//
// NICHT AKTIV, SOLANGE DIE NEUEN AGB NICHT GELTEN. Die geltende Fassung sagt
// in Ziff. 11.3 "Strado ist kein Wettbewerb um Geschwindigkeit"; der
// Eigentümer hat am 2026-09-23 entschieden, die Funktion zu bauen UND die AGB
// dafür neu zu fassen (Entwurf: docs/rechtstexte/agb-entwurf-2026-09.md).
// Eingeschaltet wird sie über die Server-Variable STRADO_LIVE_SPLIT=an —
// erst nach Inkrafttreten, Ziff. 14.1 verlangt 30 Tage Vorlauf. Bewusst kein
// NEXT_PUBLIC_-Wert: die würden beim Build eingefroren (AGENTS.md), ein
// Ausschalten bräuchte dann einen neuen Deploy.
//
// WAS DIE ZAHL IST. Gespeichert ist je Fahrt nur die Gesamtzeit, keine
// Zwischenzeiten. Der Abstand ist deshalb ein Tempovergleich: die
// Referenzzeit anteilig zur bisher gefahrenen Strecke, gegen die bisher
// verstrichene Zeit. Am Ziel ist er exakt, unterwegs eine Annäherung — ein
// Anstieg in der ersten Hälfte lässt ihn dort schlechter aussehen, als er am
// Ende ist. Das ist die ehrliche Grenze dessen, was die Daten hergeben; echte
// Zwischenzeiten brauchten gespeicherte Zeitprofile je Bestzeit, und die
// sind wegen Art. 90 SVG bewusst nur für den Fahrer selbst lesbar
// (lib/tempoprofil.ts).

/** Unter dieser Strecke gibt es noch keinen Abstand: die ersten Meter
 *  bestehen aus Anfahren, und ein "+0:40" nach 50 m wäre Rauschen. */
export const LIVE_SPLIT_MINDEST_KM = 0.3;

/** Bei diesen Anteilen der Strecke gibt es einen kurzen Vibrationstick. */
export const LIVE_SPLIT_MARKEN = [0.25, 0.5, 0.75] as const;

/** Liest den Schalter; alles ausser "an" ist aus. */
export function liveSplitEingeschaltet(wert: string | undefined): boolean {
  return wert?.trim().toLowerCase() === "an";
}

/**
 * Abstand in Sekunden: positiv = langsamer als die Referenz, negativ =
 * schneller. null, solange noch nichts Sinnvolles zu sagen ist.
 */
export function liveAbstandSekunden({
  verstrichenS,
  gefahrenKm,
  laengeKm,
  referenzS,
}: {
  verstrichenS: number;
  gefahrenKm: number;
  laengeKm: number;
  referenzS: number | null;
}): number | null {
  if (referenzS === null || !(referenzS > 0) || !(laengeKm > 0)) return null;
  if (!(gefahrenKm >= LIVE_SPLIT_MINDEST_KM)) return null;
  const anteil = Math.min(gefahrenKm / laengeKm, 1);
  return Math.round(verstrichenS - referenzS * anteil);
}

/** "−0:12" / "+1:05" / "±0:00" — mit echtem Minuszeichen, in m:ss. */
export function formatAbstand(sekunden: number): string {
  if (sekunden === 0) return "±0:00";
  const vorzeichen = sekunden < 0 ? "−" : "+";
  const betrag = Math.abs(sekunden);
  const m = Math.floor(betrag / 60);
  const s = String(betrag % 60).padStart(2, "0");
  return `${vorzeichen}${m}:${s}`;
}

/** Ob zwischen zwei Messungen eine der Marken überschritten wurde. */
export function markeUeberschritten(vorherKm: number, jetztKm: number, laengeKm: number): boolean {
  if (!(laengeKm > 0) || !(jetztKm > vorherKm)) return false;
  return LIVE_SPLIT_MARKEN.some((m) => vorherKm < m * laengeKm && jetztKm >= m * laengeKm);
}
