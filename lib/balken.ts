// Balkenhöhe in Prozent — die eine Rechenregel hinter jeder Balkenreihe der
// App: dem Klickverlauf auf /creator (components/KlickVerlauf.tsx), der
// Saisonkurve und den Anteilsbalken der Premium-Auswertung
// (components/FahrtStatistik.tsx).
//
// Sie stand bis hierher in lib/creatorKennzahlen.ts, und das ging nur so
// lange gut, wie ausser dem Creator-Verlauf niemand sie brauchte: jenes
// Modul importiert lib/supabase/server.ts und damit next/headers. Wer es
// aus einer Client Component anfasst, bricht den Build — dieselbe Falle,
// die der Kopf von lib/premiumLimits.ts ausführlich beschreibt. Eine reine
// Rechenregel gehört deshalb in eine Datei ohne jede Server-Abhängigkeit,
// damit die nächste Verwendung sie nicht aus Vorsicht abschreibt.
// creatorKennzahlen.ts reicht sie unverändert weiter, damit die
// bestehenden Aufrufstellen und ihr Test unberührt bleiben.
//
// Ein Wert > 0 bekommt mindestens 10 %, sonst wäre ein einzelner Klick
// neben einem Ausreisser optisch dasselbe wie gar nichts.
//
// Die 10 % sind an der Bahnhöhe gerechnet, nicht geschätzt: die Bahn im
// Klickverlauf ist h-12 (48 px), ein leerer Tag steht als 2-px-Strich da.
// Bei den früheren 4 % war ein Tag MIT Bewegung 1.92 px hoch — niedriger
// als der Strich, der gar nichts bedeutet, womit die Untergrenze genau das
// verfehlte, wofür es sie gibt. 10 % ergeben 4.8 px und damit denselben
// Abstand, den auch die Saisonkurve einhält.
export function balkenHoehe(wert: number, hoechstwert: number): number {
  if (wert <= 0 || hoechstwert <= 0) return 0;
  return Math.max(10, Math.round((wert / hoechstwert) * 100));
}
