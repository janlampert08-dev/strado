"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { hatOffenenEntwurf } from "@/components/useEntwurfSchutz";
import { ChevronLeft } from "lucide-react";

export default function BackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();
  const [rueckfrageOffen, setRueckfrageOffen] = useState(false);

  function zurueck() {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  }

  return (
    <>
      <button
        onClick={() => {
          // Ein Formular mit ungespeicherten Eingaben (useEntwurfSchutz) fragt
          // nach, statt sie wortlos zu verwerfen.
          if (hatOffenenEntwurf()) setRueckfrageOffen(true);
          else zurueck();
        }}
        aria-label="Zurück"
        // after:-inset-y-2: die sichtbare Pille bleibt 30 px hoch, damit der
        // Kopf nicht wächst, aber die Tippfläche reicht 8 px darüber und
        // darunter hinaus — zusammen 46 px statt 30. Gemessen war der Knopf
        // 86 × 30, auf dem Schirm, auf dem man ihn mit dem Daumen oben links
        // am schwersten trifft.
        className="relative flex shrink-0 items-center gap-1 rounded-full border border-border-control py-1 pr-3 pl-1.5 text-sm text-muted transition-colors duration-fast after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] hover:border-border-strong hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span className="whitespace-nowrap">Zurück</span>
      </button>
      <ConfirmDialog
        open={rueckfrageOffen}
        title="Entwurf verwerfen?"
        description="Deine Eingaben auf dieser Seite sind noch nicht gespeichert und gehen beim Verlassen verloren."
        confirmLabel="Verwerfen"
        cancelLabel="Weiter bearbeiten"
        variant="danger"
        onConfirm={() => {
          setRueckfrageOffen(false);
          zurueck();
        }}
        onCancel={() => setRueckfrageOffen(false)}
      />
    </>
  );
}
