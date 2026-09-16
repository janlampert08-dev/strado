// Balkenhöhe in Prozent — die eine Rechenregel hinter jeder Balkenreihe der
// App: dem Klickverlauf auf /creator (components/KlickVerlauf.tsx), der
// Saisonkurve und den Anteilsbalken der Premium-Auswertung
// (components/FahrtStatistik.tsx).
//
// Sie stand bis hierher in lib/creatorKennzahlen.ts. Der Umzug ist
// VORSORGE, nicht Reparatur: FahrtStatistik.tsx ist eine Server-Komponente,
// der Import von dort hätte heute funktioniert. Aber jenes Modul zieht
// lib/supabase/server.ts und damit next/headers nach sich, und sobald eine
// der Balkenreihen einmal Interaktion braucht — ein Tooltip genügt —,
// bricht der Build mit einer Meldung, die auf den Import zeigt statt auf
// die Ursache (die Falle aus dem Kopf von lib/premiumLimits.ts). Eine reine
// Rechenregel gehört deshalb in eine Datei ohne jede Server-Abhängigkeit,
// damit die nächste Verwendung sie nicht aus Vorsicht abschreibt.
//
// Ein Wert > 0 bekommt mindestens 10 %, sonst wäre ein einzelner Klick
// neben einem Ausreisser optisch dasselbe wie gar nichts.
//
// Die 10 % sind an der Bahnhöhe gerechnet, nicht geschätzt: ein Tag bzw.
// Monat ohne Wert steht als 2-px-Strich da, und der Mindestbalken muss
// darüber liegen — sonst verfehlt die Untergrenze genau das, wofür es sie
// gibt. Bei den früheren 4 % war ein Tag MIT Bewegung 1.92 px hoch, also
// niedriger als der Strich, der gar nichts bedeutet. Gerechnet auf die
// beiden Bahnen, die es heute gibt: 4.8 px im Klickverlauf (h-12, 48 px)
// und 4 px in der Saisonkurve (h-10, 40 px). Wer eine kürzere Bahn
// einführt, rechnet hier nach.
export function balkenHoehe(wert: number, hoechstwert: number): number {
  if (wert <= 0 || hoechstwert <= 0) return 0;
  return Math.max(10, Math.round((wert / hoechstwert) * 100));
}
