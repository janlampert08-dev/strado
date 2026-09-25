"use client";

import { useRef, useState, useTransition } from "react";
import { Clock, UserPlus, UserCheck } from "@/components/NavIcons";
import { toggleFollow } from "@/lib/actions/follows";
import { buttonVariants } from "@/components/ui/Button";
import { zeigeHinweis } from "@/components/Hinweis";
import type { FolgeZustand } from "@/lib/follows";

// Gleiches optimistisches Toggle-Muster wie FavoriteButton.tsx/KudosButton.tsx
// — seit 0146 mit einem dritten Zustand: "angefragt", wenn das Profil neue
// Follower bestätigt.
//
// Was tatsächlich geschah, sagt der Server (vorher/zustand), nicht der
// Knopf: eine offene Seite kann veraltet sein — die Anfrage ist inzwischen
// angenommen, oder man folgt schon aus einem anderen Tab.
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
  // Der aktuelle Stand für Aufrufe, die ausserhalb eines Renders passieren
  // (das Rückgängig im Hinweis) — ohne ihn sähe es den Stand von damals.
  const zustandRef = useRef(zustand);
  const [pending, startTransition] = useTransition();

  function setzen(neu: FolgeZustand) {
    zustandRef.current = neu;
    setZustand(neu);
  }

  function umschalten() {
    const angezeigt = zustandRef.current;
    const erwartet: FolgeZustand =
      angezeigt !== "keiner" ? "keiner" : brauchtBestaetigung ? "angefragt" : "folgt";
    setzen(erwartet);
    startTransition(async () => {
      const result = await toggleFollow(targetUserId);
      if (!result.ok || !result.zustand) {
        setzen(angezeigt);
        return;
      }
      setzen(result.zustand);

      if (result.vorher === "folgt") {
        // Entfolgen geschah auf einen Tipp, ohne Rückfrage — deshalb eine
        // Quittung. Rückgängig nur, wo erneutes Folgen wirklich wieder folgt:
        // bei einem Profil mit Bestätigung würde daraus eine neue Anfrage.
        if (result.brauchtBestaetigung) {
          zeigeHinweis("Nicht mehr gefolgt. Erneut folgen braucht eine neue Anfrage.");
        } else {
          zeigeHinweis("Nicht mehr gefolgt.", {
            label: "Rückgängig",
            ausfuehren: () => {
              if (zustandRef.current === "keiner") umschalten();
            },
          });
        }
      } else if (result.vorher === "angefragt") {
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
