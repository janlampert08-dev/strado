"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Setzt beim Laden einer Seite den "zuletzt gesehen"-Zeitpunkt des eigenen
// Profils auf jetzt — Grundlage für den Ungelesen-Zähler in der Kopfleiste
// (lib/aktivitaet.ts, getUnseenActivityCount). router.refresh() holt den
// Header danach neu, damit der Zähler sofort verschwindet statt erst bei
// der nächsten Navigation.
//
// WELCHER Zeitpunkt gesetzt wird, entscheidet die übergebene Server Action,
// nicht diese Komponente: /profil zeigt nur die eigenen Fahrten und räumt
// deshalb nur die Kudos ab (markKudosSeen), /aktivitaet zeigt beides und
// räumt beides ab (markActivitySeen). Dasselbe Muster wie bei
// RideSummaryForm, die ihre formAction ebenfalls gebunden bekommt (siehe
// AGENTS.md, "Core User Loop", Schritt 5) — eine Komponente, zwei
// Bedeutungen, ohne die Entscheidung im Client zu wiederholen.
//
// Nur wenn es tatsächlich Ungelesenes gibt: router.refresh() rendert die
// ganze Seite serverseitig neu — auf /profil sind das neun Abfragen plus
// GoTrue. Vorher lief das bei jedem Besuch, also fast immer für nichts, und
// die Seite lud doppelt. Die Seite weiss den Zähler ohnehin schon (beide
// Zähler sind pro Request gecacht) und reicht ihn hier durch.
export default function MarkSeen({
  hasUnseen,
  markSeen,
}: {
  hasUnseen: boolean;
  markSeen: () => Promise<{ ok: boolean }>;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!hasUnseen) return;
    markSeen().then(({ ok }) => {
      if (ok) router.refresh();
    });
  }, [hasUnseen, markSeen, router]);

  return null;
}
