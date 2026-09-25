// Eine Kennzahl mit Schweizer Tausendertrennung.
//
// Hiess CountUp, weil sie beim Laden von 0 auf den Wert hochzählte. Das ist
// raus (2026-09-23): der erste gemalte Stand war "0 m / 0 km", und Messwerte,
// die hochrollen, lesen sich wie ein Spielautomat statt wie ein Instrument.
// Der Name bleibt, damit die Aufrufstellen (app/profil/page.tsx) nicht
// wandern müssen; die Komponente ist jetzt eine Server-Komponente ohne
// JavaScript im Browser.
//
// unit als reiner String statt einer format-Funktion: die Aufrufstellen sind
// Server Components, und eine Funktion liesse sich über die Grenze ohnehin
// nicht reichen.
export default function CountUp({ value, unit }: { value: number; unit?: string }) {
  const formatted = Math.round(value).toLocaleString("de-CH");
  // \u00a0: Zahl und Einheit brechen nie auseinander (wie lib/format.ts).
  return <>{unit ? `${formatted}\u00a0${unit}` : formatted}</>;
}
