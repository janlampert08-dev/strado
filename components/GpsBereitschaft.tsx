"use client";

import { useEffect, useState } from "react";
import {
  gpsStufe,
  gpsBereitschaftsText,
  gpsBereitschaftsAnsage,
} from "@/lib/gpsBereitschaft";

// Die Bereitschaftszeile vor dem Start ("GPS ±6 m – bereit"), geteilt von
// FreeRideForm (vor dem Tippen auf "Aufzeichnung starten") und
// LiveTrackingForm (auf dem Weg zum Startpunkt). Schwellen und Texte stehen
// in lib/gpsBereitschaft.ts.
//
// Zwei Hälften, weil sie zwei Leser haben: die sichtbare Zeile folgt jedem
// Fix und nennt die Meter, die Live-Region (role="status") trägt nur die
// Stufe. Sonst sagte ein Screenreader bei jedem Fix "±7 m", "±6 m", "±8 m"
// an — bei einem Telefon, das am Tisch liegt, im Sekundentakt.
//
// Grün nur für "bereit": die Erfolgsfarbe ist die Zusage, dass man losfahren
// kann, und darf nicht schon beim Suchen aufleuchten.
export default function GpsBereitschaft({
  genauigkeitM,
  wartetAufSignal = false,
  className = "",
}: {
  genauigkeitM: number | null;
  /**
   * Ob die Zeitmessung dieser Oberfläche tatsächlich auf den ersten Fix
   * wartet. Nur bei der freien Fahrt: dort ist beginActualTracking() allein
   * aus dem Erfolgs-Callback der Watch erreichbar (useRideRecorder.ts). Im
   * Streckenmodus startet "Ich bin am Start – Zeit jetzt starten" dieselbe
   * Funktion sofort, setzt startTimeRef auf jetzt und legt das serverseitige
   * Ticket an — dort wartet nichts, und der Rat würde gewertete Zeit kosten.
   */
  wartetAufSignal?: boolean;
  className?: string;
}) {
  const stufe = gpsStufe(genauigkeitM);
  const bereit = stufe === "bereit";
  // Nach 20 s ohne Fix ein Rat statt einer ewig pulsierenden Zeile — unter
  // einem Dach oder in einem Tal kommt der erste Fix spät, und das Warten
  // sah sonst aus wie ein Fehler (Re-Audit 2026-09-23). Der Rat nennt auch,
  // dass Losfahren trotzdem geht — aber nur dort, wo das auch stimmt
  // (wartetAufSignal).
  const [langeGesucht, setLangeGesucht] = useState(false);
  useEffect(() => {
    if (stufe !== "sucht") return;
    const t = window.setTimeout(() => setLangeGesucht(true), 20_000);
    return () => {
      window.clearTimeout(t);
      setLangeGesucht(false);
    };
  }, [stufe]);
  return (
    <>
    <p className={`flex items-center gap-2 text-sm tabular-nums ${bereit ? "text-success" : "text-muted"} ${className}`}>
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${bereit ? "bg-success" : "bg-muted"} ${stufe === "sucht" ? "motion-safe:animate-pulse" : ""}`}
      />
      <span aria-hidden="true">{gpsBereitschaftsText(genauigkeitM)}</span>
      <span role="status" className="sr-only">
        {gpsBereitschaftsAnsage(genauigkeitM)}
      </span>
    </p>
    {stufe === "sucht" && langeGesucht && (
      <p className={`text-xs text-muted ${className}`}>
        Unter freiem Himmel geht es schneller.
        {wartetAufSignal && " Du kannst trotzdem starten – die Aufzeichnung wartet aufs Signal."}
      </p>
    )}
    </>
  );
}
