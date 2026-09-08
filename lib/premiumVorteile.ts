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
export const PREMIUM_VORTEILE = [
  "Eigene Strecken erstellen — privat für dich oder öffentlich nach Review",
  "12 statt 6 Fotos pro Fahrt",
  "Unbegrenzt Strecken offline speichern",
  "GPX-Export kuratierter Strecken",
] as const;
