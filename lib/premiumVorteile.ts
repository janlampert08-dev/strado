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
export const PREMIUM_VORTEILE = [
  "Auswertung nach Jahr und Fahrzeug",
  "Unbegrenzt private Strecken (ohne Abo: eine)",
  "12 statt 6 Fotos pro Fahrt",
  "Unbegrenzt Strecken offline speichern",
  "GPX-Export kuratierter Strecken",
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
export function premiumKurzform(): string {
  return PREMIUM_VORTEILE.slice(0, 3)
    // Die Klammern der Langform ("(ohne Abo: eine)") sind für die
    // Aufzählung gedacht, wo Platz für die Einschränkung ist. In einer
    // Zeile aus drei Punkten stören sie den Lesefluss — und weglassen ist
    // hier unbedenklich, weil die Kaufseite die vollständige Fassung zeigt,
    // bevor irgendjemand etwas kauft.
    .map((v) => v.replace(/\s*\([^)]*\)/g, ""))
    .join(" · ");
}
