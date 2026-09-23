"use client";

import { useState } from "react";
import FollowListModal from "@/components/FollowListModal";
import type { FollowProfile } from "@/lib/follows";

// Follower/Following-Zahlen auf Profilseiten — Klick auf eine der beiden
// Zahlen öffnet die jeweilige Liste (FollowListModal). Beide Listen kommen
// bereits vom Server mit (siehe app/profil/page.tsx bzw. app/fahrer/[id]/
// page.tsx), kein Nachladen beim Öffnen nötig.
export default function FollowCounts({
  followersCount,
  followingCount,
  followers,
  following,
  listsHidden = false,
}: {
  followersCount: number;
  followingCount: number;
  followers: FollowProfile[];
  following: FollowProfile[];
  // true auf einem fremden öffentlichen Profil, dessen Besitzer
  // zeigt_follower_liste ausgeschaltet hat — die Zahlen bleiben trotzdem
  // sichtbar (0037_public_follows.sql, bewusst unverändert), nur die beiden
  // Listen-Dialoge zeigen dann "Diese Liste ist privat." statt Namen.
  listsHidden?: boolean;
}) {
  const [openList, setOpenList] = useState<"followers" | "following" | null>(null);

  return (
    <div className="flex items-center gap-4 text-sm">
      <button
        type="button"
        onClick={() => setOpenList("followers")}
        // Die Zahl steht als Textzeile da (20 px hoch), ist aber ein Knopf,
        // der eine Liste öffnet. after: dehnt die Tippfläche auf 44 px, ohne
        // die Zeile höher zu machen.
        className="relative transition-colors duration-fast after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:text-accent-ink"
      >
        <span className="font-semibold tabular-nums">{followersCount}</span>{" "}
        <span className="text-muted">Follower</span>
      </button>
      <button
        type="button"
        onClick={() => setOpenList("following")}
        className="relative transition-colors duration-fast after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:text-accent-ink"
      >
        <span className="font-semibold tabular-nums">{followingCount}</span>{" "}
        <span className="text-muted">Gefolgt</span>
      </button>

      <FollowListModal
        open={openList === "followers"}
        onClose={() => setOpenList(null)}
        title="Follower"
        profiles={followers}
        hidden={listsHidden}
      />
      <FollowListModal
        open={openList === "following"}
        onClose={() => setOpenList(null)}
        title="Gefolgt"
        profiles={following}
        hidden={listsHidden}
      />
    </div>
  );
}
