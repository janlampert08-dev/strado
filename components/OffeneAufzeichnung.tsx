"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WeiterIcon } from "@/components/NavIcons";
import {
  GUEST_TRACKING_USER_ID,
  findeOffeneAufzeichnungen,
  type OffeneAufzeichnung,
} from "@/lib/trackingStorage";

/**
 * Liest, ob in diesem Browser eine Aufzeichnung dieses Kontos offen ist.
 *
 * Neu gelesen bei jedem Seitenwechsel (der Recorder schreibt oder löscht
 * seinen Snapshot, bevor er aushängt) und bei einem storage-Ereignis aus
 * einem anderen Tab. Vor dem Mount immer leer: localStorage gibt es auf dem
 * Server nicht, und ein Hinweis, der erst nach der Hydrierung erscheint, ist
 * besser als ein Hydrierungsfehler.
 */
export function useOffeneAufzeichnung(userId: string | null): OffeneAufzeichnung | null {
  const pathname = usePathname();
  const [offen, setOffen] = useState<OffeneAufzeichnung | null>(null);

  useEffect(() => {
    const schluessel = userId ?? GUEST_TRACKING_USER_ID;
    function lesen() {
      const gefunden = findeOffeneAufzeichnungen(schluessel);
      // Eine laufende Fahrt geht einer bloss ungespeicherten vor — sie
      // verliert mit jeder Minute Punkte, die andere nur Zeit.
      setOffen(gefunden.find((a) => a.phase === "tracking") ?? gefunden[0] ?? null);
    }
    lesen();
    window.addEventListener("storage", lesen);
    return () => window.removeEventListener("storage", lesen);
  }, [userId, pathname]);

  return offen;
}

/**
 * Der Streifen unter dem Kopf, solange eine Aufzeichnung offen ist.
 *
 * Er sagt die Wahrheit über den Zustand, und die ist unbequem: ausserhalb
 * des Aufzeichnungsschirms zeichnet NICHTS auf. Die Uhr lief beim Zurückkehren
 * scheinbar weiter, weil sie ab dem Startzeitpunkt rechnet — die GPS-Watch
 * war aber mit dem Schirm ausgehängt worden. Deshalb "unterbrochen" und nicht
 * "läuft": wer das liest, soll zurück, nicht beruhigt weitersurfen.
 */
export default function OffeneAufzeichnungStreifen({ userId }: { userId: string | null }) {
  const offen = useOffeneAufzeichnung(userId);
  if (!offen) return null;

  const laeuft = offen.phase === "tracking";
  return (
    <Link
      href={offen.href}
      className="flex min-h-11 items-center gap-3 border-b border-border bg-accent-subtle px-4 py-2 text-sm transition-colors duration-fast hover:bg-surface sm:px-6"
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${laeuft ? "animate-pulse bg-danger" : "bg-accent"}`}
      />
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {laeuft ? "Aufzeichnung unterbrochen" : "Fahrt noch nicht gespeichert"}
        </span>
        <span className="hidden text-muted sm:inline">
          {laeuft ? " — aufgezeichnet wird nur auf dem Fahrtschirm." : " — zum Speichern oder Verwerfen."}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 font-medium text-accent">
        Zurück zur Fahrt
        <WeiterIcon className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
