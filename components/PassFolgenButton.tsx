"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { passFolgenUmschalten } from "@/lib/actions/paesse";
import Button, { buttonVariants } from "@/components/ui/Button";

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

  // Ohne Konto kein stilles Nichts: wer über einen geteilten Link hier
  // landet, soll sehen, dass man Änderungen verfolgen kann — und was dafür
  // fehlt. Der Status selbst bleibt frei sichtbar, nur die Meldung braucht
  // das Konto. Nach der Anmeldung geht es zurück zum Pass, nicht auf die
  // Startseite.
  if (!angemeldet) {
    return (
      <Link
        href={`/anmelden?next=${encodeURIComponent(`/paesse#${passId}`)}`}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        Anmelden, um zu folgen
      </Link>
    );
  }

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
