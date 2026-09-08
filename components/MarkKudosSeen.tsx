"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markKudosSeen } from "@/lib/actions/kudos";

// Setzt beim Laden des eigenen Profils profiles.kudos_gesehen_am auf jetzt
// (siehe mark_kudos_seen, 0053_kudos_gesehen.sql) — Grundlage für den
// Ungelesen-Kudos-Zähler in Header/BottomNav (lib/kudos.ts,
// getUnseenKudosCount). router.refresh() holt Header danach neu, damit der
// Zähler sofort verschwindet statt erst bei der nächsten Navigation.
//
// Nur wenn es tatsächlich Ungelesenes gibt: router.refresh() rendert die
// ganze Seite serverseitig neu — auf /profil sind das neun Abfragen plus
// GoTrue. Vorher lief das bei jedem Besuch, also fast immer für nichts,
// und die Seite lud doppelt. Die Seite weiss den Zähler ohnehin schon
// (getUnseenKudosCount ist pro Request gecacht) und reicht ihn hier durch.
export default function MarkKudosSeen({ hasUnseen }: { hasUnseen: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!hasUnseen) return;
    markKudosSeen().then(({ ok }) => {
      if (ok) router.refresh();
    });
  }, [hasUnseen, router]);

  return null;
}
