"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { speedFarbeCss, speedStufe, TEMPO_LEGENDE } from "@/lib/speed";
import type { TempoprofilPunkt } from "@/types/database";

const WIDTH = 600;
const HEIGHT = 120;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 4;

// Tempodiagramm der eigenen Fahrt: wo man wie schnell gefahren ist. Gleiche
// Bühne wie ElevationProfile (600×120, Hover-Geste, einzeilige Fusszeile),
// damit der Umschalter zwischen beiden ruhig steht — nur die Y-Achse ist
// eine andere (km/h statt m ü. M.) und die Linie trägt je Abschnitt die
// Tempofarbe (dieselben Farben wie die Tempolimit-Ebene, siehe lib/speed.ts).
// Die Legende gehört zur Tempo-Ansicht allein und wächst unter dem Diagramm.
export default function TempoDiagram({
  punkte,
  schnittKmh,
}: {
  punkte: TempoprofilPunkt[];
  schnittKmh?: number | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (punkte.length < 2) return null;

  const kmMax = punkte[punkte.length - 1].km || 1;
  const kmhMax = Math.max(30, ...punkte.map((p) => p.kmh));

  const x = (km: number) => (km / kmMax) * WIDTH;
  const y = (kmh: number) =>
    PADDING_TOP + (1 - kmh / kmhMax) * (HEIGHT - PADDING_TOP - PADDING_BOTTOM);

  // Zusammenhängende Läufe derselben Farbe — ein Pfad je Lauf, damit jeder
  // Abschnitt seine Tempofarbe trägt statt einer einzigen Linienfarbe. Jeder
  // Lauf nimmt den letzten Punkt des vorherigen mit, damit zwischen den
  // Farben keine Lücke klafft.
  const laeufe: { punkte: TempoprofilPunkt[]; color: string }[] = [];
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i];
    const color = speedFarbeCss(speedStufe(p.kmh));
    const lauf = laeufe[laeufe.length - 1];
    if (lauf && lauf.color === color) lauf.punkte.push(p);
    else laeufe.push({ punkte: i > 0 ? [punkte[i - 1], p] : [p], color });
  }
  const pfade = laeufe.map((lauf) => ({
    color: lauf.color,
    d: lauf.punkte
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.km).toFixed(1)} ${y(p.kmh).toFixed(1)}`)
      .join(" "),
  }));

  const linie = punkte
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.km).toFixed(1)} ${y(p.kmh).toFixed(1)}`)
    .join(" ");
  const flaeche = `${linie} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`;

  const spitze = punkte.reduce((a, b) => (b.kmh > a.kmh ? b : a));

  function nearestIndex(clientX: number): number {
    const rect = svgRef.current!.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const km = fraction * kmMax;

    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < punkte.length; i++) {
      const dist = Math.abs(punkte[i].km - km);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    return closest;
  }

  function onPointerActivity(e: ReactPointerEvent<SVGSVGElement>) {
    setHoverIndex(nearestIndex(e.clientX));
  }

  const hoverPunkt = hoverIndex !== null ? punkte[hoverIndex] : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-28 w-full cursor-crosshair touch-none"
          role="img"
          aria-label={`Tempodiagramm, Spitze ${spitze.kmh} km/h bei km ${spitze.km}${
            hoverPunkt ? `, ausgewählt: ${hoverPunkt.kmh} km/h bei km ${hoverPunkt.km.toFixed(1)}` : ""
          }`}
          onPointerMove={onPointerActivity}
          onPointerDown={onPointerActivity}
          onPointerLeave={() => setHoverIndex(null)}
          onPointerUp={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="tempo-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--color-accent)" }} stopOpacity="0.25" />
              <stop offset="100%" style={{ stopColor: "var(--color-accent)" }} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={flaeche} fill="url(#tempo-fill)" />
          {pfade.map((pfad, i) => (
            <path
              key={i}
              d={pfad.d}
              fill="none"
              style={{ stroke: pfad.color }}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          <circle cx={x(spitze.km)} cy={y(spitze.kmh)} r="3" style={{ fill: speedFarbeCss(speedStufe(spitze.kmh)) }} />
          {hoverPunkt && (
            <>
              <line
                x1={x(hoverPunkt.km)}
                x2={x(hoverPunkt.km)}
                y1={PADDING_TOP}
                y2={HEIGHT - PADDING_BOTTOM}
                style={{ stroke: "var(--color-muted)" }}
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              <circle
                cx={x(hoverPunkt.km)}
                cy={y(hoverPunkt.kmh)}
                r="4"
                style={{ fill: speedFarbeCss(speedStufe(hoverPunkt.kmh)), stroke: "var(--color-background)" }}
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>
      </div>
      {/* Wie im Höhenprofil: der Wert unter dem Finger ersetzt die Zeile,
          statt als Blase über ihr zu liegen. "Start 34 km/h" fällt weg —
          das Tempo im ersten Fenster sagt über eine Fahrt nichts. */}
      {hoverPunkt ? (
        <p className="text-center text-xs font-medium tabular-nums text-foreground">
          {hoverPunkt.kmh} km/h · km {hoverPunkt.km.toFixed(1)}
        </p>
      ) : (
        <div className="flex justify-between gap-2 whitespace-nowrap text-xs tabular-nums text-muted">
          <span>
            Höchsttempo {spitze.kmh} km/h · km {spitze.km.toFixed(0)}
          </span>
          {schnittKmh !== null && schnittKmh !== undefined && (
            <span className="text-right">Ø {schnittKmh.toFixed(0)} km/h</span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1" aria-label="Tempo-Farben">
        {TEMPO_LEGENDE.map((eintrag) => (
          <span key={eintrag.label} className="flex items-center gap-1.5 text-xs text-muted">
            <span
              className="inline-block h-0.5 w-4"
              style={{ backgroundColor: eintrag.color }}
              aria-hidden="true"
            />
            {eintrag.label}
          </span>
        ))}
      </div>
    </div>
  );
}
