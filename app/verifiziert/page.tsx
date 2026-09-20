import type { Metadata } from "next";
import Header from "@/components/Header";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import VerifiziertErklaerung from "@/components/VerifiziertErklaerung";

export const metadata: Metadata = {
  title: "Verifizierte Zeiten – Strado",
  description:
    "Was das Abzeichen an einer Fahrt bedeutet, wie Strado die Dauer misst und wo die Grenzen liegen.",
  alternates: { canonical: "/verifiziert" },
};

// Die kanonische Fassung der Erklärung — für Suche und geteilte Links.
// Wer auf das Abzeichen tippt, sieht denselben Text als Blatt
// (components/VerifiziertAbzeichen.tsx): ein Erklärtext ist im Alltag keine
// Adresse, aber er braucht eine.
export default function VerifiziertPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen>
          <h1 className="text-display font-semibold tracking-tight">Verifizierte Zeiten</h1>
          <div className="mt-3">
            <VerifiziertErklaerung />
          </div>
        </Seitenrahmen>
      </div>
    </div>
  );
}
