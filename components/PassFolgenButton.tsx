"use client";

import { useOptimistic, useTransition } from "react";
import { passFolgenUmschalten } from "@/lib/actions/paesse";
import Button from "@/components/ui/Button";

/**
 * "Bei Änderungen melden" — folgt einem Pass, damit ein Wechsel von zu auf
 * offen (oder umgekehrt) in der Aktivität auftaucht.
 *
 * Der Text sagt, was passiert, nicht wie es heisst: "Folgen" ist in dieser
 * App das, was man mit Fahrerinnen tut. Ein Pass antwortet nicht.
 */
export default function PassFolgenButton({
  passId,
  passName,
  folgtMan,
  angemeldet,
}: {
  passId: string;
  passName: string;
  folgtMan: boolean;
  angemeldet: boolean;
}) {
  const [laeuft, starteUebergang] = useTransition();
  const [optimistisch, setzeOptimistisch] = useOptimistic(folgtMan);

  if (!angemeldet) return null;

  return (
    <Button
      variant={optimistisch ? "secondary" : "primary"}
      size="sm"
      disabled={laeuft}
      aria-pressed={optimistisch}
      onClick={() => {
        starteUebergang(async () => {
          setzeOptimistisch(!optimistisch);
          await passFolgenUmschalten(passId);
        });
      }}
    >
      {optimistisch ? "Meldungen an" : "Bei Änderungen melden"}
      <span className="sr-only"> — {passName}</span>
    </Button>
  );
}
