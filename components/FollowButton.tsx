"use client";

import { useState, useTransition } from "react";
import { UserPlus, UserCheck } from "@/components/NavIcons";
import { toggleFollow } from "@/lib/actions/follows";
import { buttonVariants } from "@/components/ui/Button";
import { zeigeHinweis } from "@/components/Hinweis";

// Gleiches optimistisches Toggle-Muster wie FavoriteButton.tsx/KudosButton.tsx.
export default function FollowButton({
  targetUserId,
  initialFollowing,
}: {
  targetUserId: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  function umschalten(next: boolean) {
    setFollowing(next);
    startTransition(async () => {
      const { ok } = await toggleFollow(targetUserId);
      if (!ok) {
        setFollowing(!next);
        return;
      }
      // Entfolgen geschah auf einen Tipp, ohne Rückfrage und ohne Weg zurück
      // ausser erneut zu folgen — und wer ein zweites Mal tippt, weiss oft
      // nicht, ob er gerade folgt oder nicht. Jetzt eine Quittung mit
      // Rückgängig. Folgen selbst quittiert der Knopf, der umspringt.
      if (!next) {
        zeigeHinweis("Nicht mehr gefolgt.", {
          label: "Rückgängig",
          ausfuehren: () => umschalten(true),
        });
      }
    });
  }

  function handleClick() {
    umschalten(!following);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={following}
      className={buttonVariants({ variant: following ? "secondary" : "accent", size: "sm" })}
    >
      {following ? (
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {/* "Folgst du" statt "Gefolgt": dasselbe Wort stand eine Zeile höher
          als Zähler ("4 Gefolgt" — wem diese Person folgt). Direkt daneben
          meinte es auf dem Knopf das Gegenteil, nämlich dass DU folgst. */}
      {following ? "Folgst du" : "Folgen"}
    </button>
  );
}
