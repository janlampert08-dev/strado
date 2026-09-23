"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import { Lock, Users } from "@/components/NavIcons";
import type { FollowProfile } from "@/lib/follows";

// Popup für die Follower/Following-Zahlen auf Profilseiten (eigenes und
// fremde öffentliche) — Dialog.tsx gibt Fokus-Trap, Escape und
// Klick-ausserhalb-schliesst bereits kostenlos (natives <dialog>).
export default function FollowListModal({
  open,
  onClose,
  title,
  profiles,
  hidden = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  profiles: FollowProfile[];
  // true wenn der Profil-Besitzer zeigt_follower_liste ausgeschaltet hat und
  // dieser Betrachter nicht der Besitzer selbst ist — profiles ist dann
  // ohnehin leer (die aufrufende Seite lädt die echten Daten für Dritte gar
  // nicht erst), zeigt aber eine erklärende Meldung statt "Noch niemand.",
  // damit niemand fälschlich denkt, es folge wirklich niemand.
  hidden?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-h-[70dvh] overflow-y-auto overscroll-y-contain">
      {hidden ? (
        <EmptyState icon={Lock} title="Diese Liste ist privat." />
      ) : profiles.length === 0 ? (
        <EmptyState icon={Users} title="Noch niemand." />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <Link
                href={`/fahrer/${profile.id}`}
                onClick={onClose}
                className="flex items-center gap-3 py-2.5 transition-colors duration-fast hover:text-accent"
              >
                <Avatar url={profile.avatarUrl} name={profile.displayName} size={36} />
                <span className="truncate text-sm font-medium">
                  {profile.displayName ?? "Fahrer"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
