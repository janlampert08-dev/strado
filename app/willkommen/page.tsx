import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import { NICHT_INDEXIEREN } from "@/lib/seo";
import { buttonVariants } from "@/components/ui/Button";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

// Erste Seite nach einer frischen Registrierung (bestaetigeRegistrierung()
// und der Sofort-Login aus signUp() landen hier, wenn kein next-Ziel
// mitreist — der Gast-Fahrt-Handoff mit next bleibt unberührt und geht
// direkt zurück in den Recorder). Kein Onboarding-Assistent mit Pflicht:
// drei Schritte, jeder überspringbar, der wichtigste zuerst. Konto ohne
// Fahrt ist ein totes Konto — deshalb steht die freie Fahrt oben, nicht
// das Fahrzeug.
//
// Nicht indexiert: persönliche Zwischenseite, kein Inhalt für Suchmaschinen.
export const metadata: Metadata = {
  title: "Willkommen – Strado",
  robots: NICHT_INDEXIEREN,
};

const SCHRITTE = [
  {
    nummer: "1",
    titel: "Dreh eine erste Runde",
    text: "2 km um den Block genügen — eine freie Fahrt zählt sofort, ganz ohne Strecke.",
    aktion: (
      <Link href="/fahrten/neu" className={buttonVariants({ variant: "accent", size: "md" })}>
        Freie Fahrt starten
      </Link>
    ),
  },
  {
    nummer: "2",
    titel: "GPS kurz testen",
    text: "Standort erlauben, 10 Sekunden stehen bleiben — steht der Punkt ruhig, steht die Aufzeichnung.",
    aktion: (
      <Link href="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
        Strecken in meiner Nähe
      </Link>
    ),
  },
  {
    nummer: "3",
    titel: "Fahrzeug anlegen (optional)",
    text: "Auto oder Töff mit Klasse hinterlegen — dann landet jede Fahrt gleich in der richtigen Wertung.",
    aktion: (
      <Link
        href="/profil/fahrzeuge/neu"
        className={buttonVariants({ variant: "ghost", size: "md" })}
      >
        Fahrzeug hinzufügen
      </Link>
    ),
  },
];

export default function WillkommenPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite="schmal" className="min-h-full justify-center">
          <h1 className="text-display font-semibold">Willkommen bei Strado</h1>
          <p className="text-sm text-muted">
            Dein Konto steht. Drei Schritte, dann bist du auf der Strasse —
            alles kann, nichts muss.
          </p>
          <ol className="flex flex-col gap-4">
            {SCHRITTE.map((schritt) => (
              <li
                key={schritt.nummer}
                className="flex gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background"
                >
                  {schritt.nummer}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h2 className="text-base font-medium">{schritt.titel}</h2>
                  <p className="text-sm text-muted">{schritt.text}</p>
                  <div className="pt-1">{schritt.aktion}</div>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "md" })}>
            Später — direkt zu den Strecken
          </Link>
        </Seitenrahmen>
      </div>
    </div>
  );
}
