"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { HoehenprofilPunkt } from "@/types/database";

const WIDTH = 600;
const HEIGHT = 120;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 4;

export default function ElevationProfile({ punkte }: { punkte: HoehenprofilPunkt[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (punkte.length < 2) return null;

  const kmMax = punkte[punkte.length - 1].km || 1;
  const mMin = Math.min(...punkte.map((p) => p.m));
  const mMax = Math.max(...punkte.map((p) => p.m));
  const mRange = Math.max(mMax - mMin, 1);

  const x = (km: number) => (km / kmMax) * WIDTH;
  const y = (m: number) =>
    PADDING_TOP + (1 - (m - mMin) / mRange) * (HEIGHT - PADDING_TOP - PADDING_BOTTOM);

  const linePath = punkte.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.km).toFixed(1)} ${y(p.m).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`;

  const gipfel = punkte.reduce((a, b) => (b.m > a.m ? b : a));

  // Nächstgelegenen Punkt zur Zeigerposition finden — auf Maus reicht
  // pointermove für ein reines Hover-Tooltip, auf Touch feuert es nur
  // während des Ziehens (kein "hover" auf Touch), ergibt dort also von
  // selbst eine Drag-to-inspect-Geste.
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
          aria-label={`Höhenprofil, Scheitelpunkt ${gipfel.m} m bei km ${gipfel.km}${
            hoverPunkt ? `, ausgewählt: ${hoverPunkt.m} m bei km ${hoverPunkt.km.toFixed(1)}` : ""
          }`}
          onPointerMove={onPointerActivity}
          onPointerDown={onPointerActivity}
          onPointerLeave={() => setHoverIndex(null)}
          onPointerUp={() => setHoverIndex(null)}
        >
          <defs>
            {/* stopColor über style statt Attribut, damit var(--color-accent) im
                Dark Mode (siehe app/globals.css) korrekt mitwechselt — ein
                hartkodierter Hex-Wert hier würde den Token-Tausch umgehen. */}
            <linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--color-accent)" }} stopOpacity="0.25" />
              <stop offset="100%" style={{ stopColor: "var(--color-accent)" }} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#elevation-fill)" />
          <path
            d={linePath}
            fill="none"
            style={{ stroke: "var(--color-accent)" }}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={x(gipfel.km)} cy={y(gipfel.m)} r="3" style={{ fill: "var(--color-accent)" }} />
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
                cy={y(hoverPunkt.m)}
                r="4"
                style={{ fill: "var(--color-accent)", stroke: "var(--color-background)" }}
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>
        {hoverPunkt && (
          <div
            className="pointer-events-none absolute rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums shadow-elevated"
            // Unter der Kurve statt darüber: oben lag die Blase über
            // "Strecke starten" — der Hinweis verdeckte die Handlung, für die
            // die Seite da ist.
            style={{
              left: `${(hoverPunkt.km / kmMax) * 100}%`,
              bottom: 0,
              transform: "translate(-50%, calc(100% + 6px))",
            }}
          >
            {hoverPunkt.m} m · km {hoverPunkt.km.toFixed(1)}
          </div>
        )}
      </div>
      {/* Start · höchster Punkt · Ziel, statt Minimum · Gipfel · Maximum.
          Der Gipfel IST das Maximum — rechts stand also zweimal dieselbe
          Zahl, und an der Stelle, an der man das Streckenende erwartet,
          las sie sich als Zielhöhe, während die Linie darüber abfiel. */}
      <div className="flex justify-between gap-2 text-xs tabular-nums text-muted">
        <span>Start {punkte[0].m} m</span>
        <span className="text-center">
          Höchster Punkt {gipfel.m} m · km {gipfel.km.toFixed(0)}
        </span>
        <span className="text-right">Ziel {punkte[punkte.length - 1].m} m</span>
      </div>
    </div>
  );
}
