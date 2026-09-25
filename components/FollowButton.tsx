"use client";

import { useState, useTransition } from "react";
import { Clock, UserPlus, UserCheck } from "@/components/NavIcons";
import { toggleFollow } from "@/lib/actions/follows";
import { buttonVariants } from "@/components/ui/Button";
import { zeigeHinweis } from "@/components/Hinweis";
import type { FolgeZustand } from "@/lib/follows";

// Gleiches optimistisches Toggle-Muster wie FavoriteButton.tsx/KudosButton.tsx
// — seit 0146 mit einem dritten Zustand: "angefragt", wenn das Profil neue
// Follower bestätigt.
export default function FollowButton({
  targetUserId,
  initialZustand,
  brauchtBestaetigung,
}: {
  targetUserId: string;
  initialZustand: FolgeZustand;
  brauchtBestaetigung: boolean;
}) {
  const [zustand, setZustand] = useState<FolgeZustand>(initialZustand);
  const [pending, startTransition] = useTransition();

  function erwarteterNaechster(von: FolgeZustand): FolgeZustand {
    if (von !== "keiner") return "keiner";
    return brauchtBestaetigung ? "angefragt" : "folgt";
  }

  function umschalten() {
    const vorher = zustand;
    setZustand(erwarteterNaechster(vorher));
    startTransition(async () => {
      const result = await toggleFollow(targetUserId);
      if (!result.ok || !result.zustand) {
        setZustand(vorher);
        return;
      }
      // Der Server entscheidet, ob gefolgt oder angefragt wurde — die
      // Einstellung kann sich seit dem Laden der Seite geändert haben.
      setZustand(result.zustand);
      // Entfolgen geschah auf einen Tipp, ohne Rückfrage und ohne Weg zurück
      // ausser erneut zu folgen — und wer ein zweites Mal tippt, weiss oft
      // nicht, ob er gerade folgt oder nicht. Jetzt eine Quittung mit
      // Rückgängig. Folgen selbst quittiert der Knopf, der umspringt.
      if (vorher === "folgt") {
        zeigeHinweis("Nicht mehr gefolgt.", {
          label: "Rückgängig",
          ausfuehren: umschalten,
        });
      } else if (vorher === "angefragt") {
        zeigeHinweis("Anfrage zurückgezogen.");
      } else if (result.zustand === "angefragt") {
        zeigeHinweis("Anfrage gesendet. Du folgst, sobald sie angenommen ist.");
      }
    });
  }

  const Icon = zustand === "folgt" ? UserCheck : zustand === "angefragt" ? Clock : UserPlus;

  return (
    <button
      type="button"
      onClick={umschalten}
      disabled={pending}
      aria-pressed={zustand !== "keiner"}
      title={zustand === "angefragt" ? "Tippen, um die Anfrage zurückzuziehen" : undefined}
      className={buttonVariants({ variant: zustand === "keiner" ? "accent" : "secondary", size: "sm" })}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {/* "Folgst du" statt "Gefolgt": dasselbe Wort stand eine Zeile höher
          als Zähler ("4 Gefolgt" — wem diese Person folgt). Direkt daneben
          meinte es auf dem Knopf das Gegenteil, nämlich dass DU folgst. */}
      {zustand === "folgt"
        ? "Folgst du"
        : zustand === "angefragt"
          ? "Angefragt"
          : brauchtBestaetigung
            ? "Folgen anfragen"
            : "Folgen"}
    </button>
  );
}
