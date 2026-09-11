"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

// Kleiner Kopierknopf für Text, der weitergegeben werden soll (heute: die
// Creator-Einstiegslinks unter /moderation/creator). Bewusst ohne
// navigator.share — anders als beim Teilen einer Strecke
// (RouteActionsMenu.tsx) geht der Link hier in eine Direktnachricht oder in
// eine Notiz, nicht in das Teilen-Menü des Systems.
export default function CopyButton({
  text,
  label = "Kopieren",
}: {
  text: string;
  label?: string;
}) {
  const [kopiert, setKopiert] = useState(false);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1200);
    } catch {
      // Zwischenablage nicht verfügbar (kein sicherer Kontext, Berechtigung
      // verweigert). Kein Fehlerzustand: der Text steht daneben und lässt
      // sich markieren.
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={kopieren}>
      <span aria-live="polite">{kopiert ? "Kopiert" : label}</span>
    </Button>
  );
}
