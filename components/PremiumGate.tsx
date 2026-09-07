import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import Header from "@/components/Header";
import Card from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";

// Was jemand ohne Abo sieht, wenn er "Strecke erstellen" antippt: eine
// kleine Premium-Werbung statt eines Formulars, das beim Speichern
// scheitern würde.
//
// Das hier ist UX, keine Schranke. Durchgesetzt wird der Premium-Zwang von
// der INSERT-Policy auf routes (Migration 0077) und noch einmal in
// proposeRoute (lib/actions/routes.ts); wer diese Seite umgeht, landet dort.
// Die Vorteile sind dieselben wie auf der Kaufseite (PremiumPurchaseView),
// hier auf drei Zeilen gekürzt — der Weg dorthin ist ein Tipp entfernt.
const VORTEILE = [
  "Eigene Strecken — privat oder öffentlich nach Review",
  "12 statt 6 Fotos pro Fahrt",
  "Offline ohne Limit und GPX-Export",
];

export default function PremiumGate() {
  return (
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-8 sm:px-6">
        <Card className="flex w-full max-w-md flex-col gap-5 px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1 text-xs font-semibold tracking-wide text-accent uppercase">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Premium
            </span>
            <h1 className="text-title font-semibold">Eigene Strecken sind Premium</h1>
            <p className="text-sm text-muted">
              Zeichne deine Lieblingsstrecke selbst — privat nur für dich, oder öffentlich nach
              kurzer Prüfung durch die Moderation.
            </p>
          </div>

          <ul className="flex flex-col gap-2.5 text-sm text-foreground">
            {VORTEILE.map((vorteil) => (
              <li key={vorteil} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{vorteil}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <Link href="/profil/premium" className={buttonVariants({ className: "w-full" })}>
              Premium holen
            </Link>
            <Link
              href="/profil"
              className={buttonVariants({ variant: "secondary", className: "w-full" })}
            >
              Zurück
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
