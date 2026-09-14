import type { Metadata } from "next";
import Header from "@/components/Header";
import { NICHT_INDEXIEREN } from "@/lib/seo";

// Hatte bisher keine Metadata und erbte damit den Titel "Strado" aus dem
// Layout — dieselbe Zeile wie die Startseite, für eine Zwischenseite, die
// nur "schau in dein Postfach" sagt. Sie steht jedem offen (keine
// Session-Prüfung) und war deshalb indexierbar.
export const metadata: Metadata = {
  title: "E-Mail bestätigen – Strado",
  robots: NICHT_INDEXIEREN,
};

export default function BestaetigenPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header back="/" />
      <main className="mx-auto flex max-w-sm flex-1 flex-col items-start justify-center gap-3 px-6">
        <h1 className="text-display font-semibold">Fast geschafft</h1>
        <p className="text-sm text-muted">
          Wir haben dir eine Bestätigungs-E-Mail geschickt. Klicke auf den Link
          darin, um dein Konto zu aktivieren.
        </p>
      </main>
    </div>
  );
}
