// Was Premium dazugibt — eine Liste, zwei Seiten.
//
// Die Kaufseite (components/PremiumPurchaseView.tsx) verspricht diese
// Punkte, die Abschluss-Seite (components/PremiumWillkommen.tsx) quittiert
// sie. Stünden sie zweimal im Code, driftete eine der beiden Listen
// irgendwann ab — und das ist hier keine Kosmetik: was auf der Kaufseite
// steht, ist eine zugesagte Vertragsleistung (AGB Ziff. 3.2), und was
// unmittelbar nach der Zahlung steht, liest man als Bestätigung genau
// dieser Zusage.
//
// Deshalb gilt weiter, was in PremiumPurchaseView stand: hier steht nur,
// was es tatsächlich gibt. Ein geplantes Feature gehört nicht in diese
// Liste.
// Mit dem Premium-Ausbau vom 2026-09-17 sind drei Zeilen dazugekommen
// (Wetterfenster, Pass-Sammlung mit Saisonrückblick, Wartungsheft). Jede
// davon steht hier erst, weil sie im selben PR ausgeliefert wird — und AGB
// Ziff. 3.2 zieht im selben Schritt mit, weil diese Liste die dort zugesagte
// Leistung ist.
//
// Eine vierte war geplant und ist wieder herausgefallen: der Pass-Alarm.
// Während dieser Ausbau lief, ist aus einem anderen Zweig ein vollständiges
// Pass-System live gegangen (Pässe als eigene Objekte, mit Status, Sperrtagen
// und Abos). Zwei Systeme für dieselbe Frage wären zwei Wahrheiten gewesen;
// unsere Fassung wurde zurückgezogen, bevor irgendjemand sie als Zusage
// lesen konnte. Details in supabase/migrations/README.md unter 0112.
//
// Der erste Punkt hiess bis 0086 "Eigene Strecken erstellen — privat für
// dich oder öffentlich nach Review". Das Erstellen selbst ist seither wieder
// kostenlos (siehe 0086_strecken_anlegen_wieder_offen.sql); Premium hebt nur
// noch die Zahl der PRIVATEN Strecken auf. Die Klammer steht bewusst dabei:
// ein Vorteil, der verschweigt, was es auch ohne Abo gibt, wird spätestens
// beim ersten Ausprobieren als Übertreibung gelesen.
// Die Auswertung steht vorne, weil sie als einzige mit der Zeit wertvoller
// wird: nach zwei Saisons gibt es einen Vergleich, den es vorher nicht gab.
// Sie zeigt bewusst keine Zeiten und kein Tempo — die Begründung steht im
// Kopf von lib/fahrtstatistik.ts (Audit-Befund A1, AGB Ziff. 11.3).
// Reihenfolge: vorne steht, was am ersten Tag einen Grund gibt, und hinten
// die Obergrenzen, die man erst im zweiten Sommer spürt. Das ist die
// Korrektur an der alten Liste — sie begann mit der Auswertung, und ein
// neues Konto hat noch keine Saison, die sich auswerten liesse
// (docs/premium-neu/features.md).
//
// Die drei ersten Zeilen haben zusätzlich eine Aufgabe: premiumKurzform()
// unten baut daraus die Zeile, die Konten OHNE Abo sehen.
export const PREMIUM_VORTEILE = [
  "Wetterfenster: die trockenen Tage der Woche",
  "Pass-Sammlung und Saisonrückblick als Bild",
  "Wartungsheft mit MFK- und Service-Erinnerung",
  "GPX-Export kuratierter Strecken — fürs Navi",
  "Auswertung nach Jahr und Fahrzeug",
  "Unbegrenzt Strecken offline speichern",
  "Unbegrenzt private Strecken (ohne Abo: eine)",
  "12 statt 6 Fotos pro Fahrt",
] as const;

// Die Kurzform für Stellen, an denen kein Platz für fünf Zeilen ist: die
// Zeile im Profil (components/PremiumCard.tsx) und die Zeile in den
// Einstellungen.
//
// Sie leitet sich aus derselben Liste ab, statt daneben zu existieren — und
// das ist der Punkt. Bis hierher stand im Profil eine dritte, von Hand
// gepflegte Kopie ("Unbegrenzt private Strecken, 12 Fotos pro Fahrt, Offline
// ohne Limit, GPX-Export"), obwohl der Kopf dieser Datei von "eine Liste,
// zwei Seiten" ausgeht. Genau diese Kopie ist mit Migration 0086 verrutscht:
// sie warb weiter mit "Eigene Strecken erstellen", während das Erstellen
// längst wieder kostenlos war. Eine abgeleitete Zeile kann das nicht.
//
// Drei Punkte, nicht fünf: die Zeile soll überflogen werden, nicht gelesen.
// Wer es genau wissen will, tippt und landet auf der Kaufseite, wo die volle
// Liste steht.
//
// AUSGEWÄHLT, NICHT GEKÜRZT — und das ist der Unterschied, um den es geht.
// Diese Funktion strich zuerst per Regex jede Klammer aus den ersten drei
// Punkten. Damit wurde aus "Unbegrenzt private Strecken (ohne Abo: eine)"
// die Zeile "Unbegrenzt private Strecken" — ausgerechnet die Klammer, von
// der der Kopf dieser Datei zwanzig Zeilen weiter oben sagt, sie stehe
// bewusst dabei: "ein Vorteil, der verschweigt, was es auch ohne Abo gibt,
// wird spätestens beim ersten Ausprobieren als Übertreibung gelesen". Und
// zu sehen bekommen diese Zeile genau die Konten OHNE Abo, in der
// Profilkarte und in den Einstellungen — also das Publikum, für das der
// Satz geschrieben wurde.
//
// Deshalb wird jetzt gefiltert statt ersetzt: übrig bleiben die Punkte, die
// ohne Einschränkung auskommen. Die Zeile besteht damit aus Einträgen der
// Liste im Wortlaut, und keine Formulierung kann sich hier still ändern.
// lib/premiumVorteile.test.ts hält genau das offen.
export function premiumKurzform(): string {
  return PREMIUM_VORTEILE.filter((v) => !v.includes("("))
    .slice(0, 3)
    .join(" · ");
}
