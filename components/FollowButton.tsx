"use client";

import { useState, useTransition } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { toggleFollow } from "@/lib/actions/follows";
import { buttonVariants } from "@/components/ui/Button";

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

  function handleClick() {
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const { ok } = await toggleFollow(targetUserId);
      if (!ok) setFollowing(!next);
    });
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
