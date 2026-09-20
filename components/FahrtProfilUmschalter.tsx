"use client";

import { useState } from "react";
import ElevationProfile from "@/components/ElevationProfile";
import TempoDiagram from "@/components/TempoDiagram";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { HoehenprofilPunkt, TempoprofilPunkt } from "@/types/database";

// Höhenprofil oder Tempodiagramm — nie beides gleichzeitig. Der Umschalter
// erscheint nur, wenn beide Profile vorliegen: Das Höhenprofil hat jede
// Fahrt mit Schweizer Koordinaten, das Tempoprofil (0115) nur Fahrten ab
// dieser Migration und nur für den Besitzer. Mit nur einem Profil gibt es
// nichts zu wählen und das Diagramm steht wie bisher allein.
export default function FahrtProfilUmschalter({
  hoehenprofil,
  tempoprofil,
  schnittKmh,
}: {
  hoehenprofil: HoehenprofilPunkt[] | null;
  // null heisst: zu alt oder fremde Fahrt — dann bleibt das Höhenprofil
  // allein, ohne Umschalter.
  tempoprofil: TempoprofilPunkt[] | null;
  schnittKmh: number | null;
}) {
  const [ansicht, setAnsicht] = useState<"hoehe" | "tempo">("hoehe");

  const hoehe = hoehenprofil !== null && hoehenprofil.length > 1 ? hoehenprofil : null;
  const tempo = tempoprofil !== null && tempoprofil.length > 1 ? tempoprofil : null;

  if (!hoehe && !tempo) return null;
  if (tempo && !hoehe) return <TempoDiagram punkte={tempo} schnittKmh={schnittKmh} />;
  if (hoehe && !tempo) return <ElevationProfile punkte={hoehe} />;
  if (!hoehe || !tempo) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center">
        <SegmentedControl
          label="Profilansicht"
          wert={ansicht}
          onChange={setAnsicht}
          segmente={[
            { wert: "hoehe", label: "Höhe" },
            { wert: "tempo", label: "Tempo" },
          ]}
        />
      </div>
      {ansicht === "hoehe" ? (
        <ElevationProfile punkte={hoehe} />
      ) : (
        <TempoDiagram punkte={tempo} schnittKmh={schnittKmh} />
      )}
    </div>
  );
}
