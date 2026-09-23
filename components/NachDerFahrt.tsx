"use client";

import { useSyncExternalStore, useTransition } from "react";
import PremiumHinweis from "@/components/PremiumHinweis";
import Button from "@/components/ui/Button";
import { TeilenIcon } from "@/components/NavIcons";
import { useGeraet } from "@/components/useStandortFreigabe";
import {
  abonniereInstallation,
  installationErledigt,
  installationsAngebot,
  installieren,
  merkeInstallationErledigt,
} from "@/lib/installation";
import { installationsWeg } from "@/lib/nachDerFahrt";

/**
 * Unter der eigenen Fahrt: höchstens EINE Sache, die als Nächstes kommt.
 *
 * 1. Strado auf den Home-Bildschirm — solange es nicht installiert ist. Das
 *    kommt zuerst, weil es über die nächste Fahrt entscheidet: eine
 *    Browser-Seite vergisst man, ein Symbol auf dem Home-Bildschirm nicht.
 *    Genau nach einer gespeicherten Fahrt, weil der Nutzer dann weiss,
 *    wofür er es installiert — beim ersten Seitenaufruf weiss er es nicht.
 * 2. Sonst der Premium-Satz, der zu dieser Fahrt passt
 *    (premiumSatzZurFahrt), in der leisen Form von PremiumHinweis.
 *
 * Nie beides: zwei Bitten untereinander lesen sich wie eine Werbefläche.
 *
 * Rendert auf dem Server nichts — ob installiert, auf welchem Gerät und ob
 * der Browser ein Angebot hat, weiss nur der Browser. Die Zeile erscheint
 * deshalb einen Augenblick nach der Seite, ganz unten, wo sie nichts
 * verschiebt, das man schon liest.
 */
export default function NachDerFahrt({ premiumSatz }: { premiumSatz: string | null }) {
  const geraet = useGeraet();
  const erledigt = useSyncExternalStore(abonniereInstallation, installationErledigt, () => true);
  const angebot = useSyncExternalStore(abonniereInstallation, installationsAngebot, () => null);
  const [laeuft, starte] = useTransition();

  if (!geraet) return null;

  const weg = installationsWeg({ geraet, hatAngebot: angebot !== null, erledigt });

  if (!weg) {
    return premiumSatz ? <PremiumHinweis>{premiumSatz}</PremiumHinweis> : null;
  }

  return (
    <section aria-labelledby="home-bildschirm-titel" className="flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex flex-col gap-1">
        <h2 id="home-bildschirm-titel" className="text-sm font-semibold">
          Strado auf den Home-Bildschirm
        </h2>
        <p className="text-sm text-muted text-pretty">
          {weg === "ios-anleitung" ? (
            <>
              Dann ist die nächste Fahrt einen Tipp entfernt, ohne Browserleiste. Tippe in Safari
              auf{" "}
              <TeilenIcon
                className="inline h-4 w-4 -translate-y-px align-middle text-foreground"
                role="img"
                aria-label="Teilen"
              />{" "}
              und dann auf <span className="text-foreground">«Zum Home-Bildschirm»</span>.
            </>
          ) : (
            "Dann ist die nächste Fahrt einen Tipp entfernt, ohne Browserleiste."
          )}
        </p>
      </div>
      <div className="flex items-center gap-4">
        {weg === "knopf" && (
          <Button
            variant="secondary"
            size="md"
            disabled={laeuft}
            onClick={() => starte(async () => void (await installieren()))}
          >
            Installieren
          </Button>
        )}
        <button
          type="button"
          onClick={merkeInstallationErledigt}
          className="min-h-11 text-sm text-muted transition-colors duration-fast hover:text-foreground"
        >
          Nicht jetzt
        </button>
      </div>
    </section>
  );
}
