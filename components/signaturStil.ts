import { Gauge, Mountain, Route, Ruler, TrendingUp } from "@/components/NavIcons";
import type { SignatureKey } from "@/lib/signature";

// Icon und Utility-Klassen je Signatur-Merkmal — die Anzeigeseite dessen,
// was lib/signature.ts berechnet.
//
// Bis hierher standen beide Zuordnungen in ExploreSidebar.tsx, und damit
// endete der Ton an der Streckenliste: wer eine violette Zeile antippte,
// landete auf einer Seite, die von der Auszeichnung nichts mehr wusste. Der
// Ton ist aber genau die Antwort auf "warum ist diese Strecke besonders" —
// er gehört an beide Enden des Klicks. Eine eigene Datei, weil die Liste ein
// Client-Bauteil ist und die Streckenseite eine Server Component.
//
// Die Utility-Klassen sind ausgeschrieben und nicht zusammengesetzt:
// Tailwind liest Klassennamen statisch aus dem Quelltext, ein
// `text-signatur-${key}` stünde in keinem erzeugten Stylesheet. Die
// Hex-Werte dahinter stehen in app/globals.css, für hell und dunkel gesetzt
// und gegen Hintergrund, Fläche und Hover-Grund nachgerechnet (kleinster
// Wert 4,70:1) — siehe lib/signature.ts.
export const SIGNATURE_ICONS: Record<SignatureKey, typeof Mountain> = {
  kehren: Route,
  steigung: TrendingUp,
  hoehe: Mountain,
  tempo: Gauge,
  laenge: Ruler,
};

export const SIGNATUR_KLASSEN: Record<SignatureKey, { rand: string; text: string }> = {
  kehren: { rand: "border-l-signatur-kehren", text: "text-signatur-kehren" },
  steigung: { rand: "border-l-signatur-steigung", text: "text-signatur-steigung" },
  hoehe: { rand: "border-l-signatur-hoehe", text: "text-signatur-hoehe" },
  tempo: { rand: "border-l-signatur-tempo", text: "text-signatur-tempo" },
  laenge: { rand: "border-l-signatur-laenge", text: "text-signatur-laenge" },
};
