"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatMeter } from "@/lib/format";
import { hoehenAchse } from "@/lib/hoehenAchse";
import type { HoehenprofilPunkt, HoehenQuelle } from "@/types/database";

const WIDTH = 600;
const HEIGHT = 120;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 4;

export default function ElevationProfile({
  punkte,
  quelle = "swisstopo",
  gross = false,
}: {
  punkte: HoehenprofilPunkt[];
  /** Als Hauptbild der Streckenseite: höher und mit beschrifteten
   *  Höhenlinien. Ohne bleibt es die kompakte Fassung (Fahrtseite, Fazit). */
  gross?: boolean;
  // Woher das Profil stammt: Routenprofile kommen immer von swisstopo
  // swissALTI3D (lib/actions/routes.ts), Fahrtenprofile nur, wenn
  // deriveElevation eins geliefert hat (route_completions.hoehen_quelle,
  // 0120) — sonst heisst es ehrlich "geschaetzt". null heisst unbekannt
  // (Bestand von vor 0120) und rendert keine Zeile, statt zu raten.
  quelle?: HoehenQuelle | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (punkte.length < 2) return null;

  const kmMax = punkte[punkte.length - 1].km || 1;
  // Achse mit Mindestspanne statt von tiefster zu höchster Stelle
  // (lib/hoehenAchse.ts): eine flache Runde soll flach aussehen.
  const achse = hoehenAchse(
    Math.min(...punkte.map((p) => p.m)),
    Math.max(...punkte.map((p) => p.m)),
  );
  const mMin = achse.unten;
  const mRange = Math.max(achse.oben - achse.unten, 1);

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
          className={`${gross ? "h-44" : "h-28"} w-full cursor-crosshair touch-none`}
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
          {/* Höhenlinien wie auf der Landeskarte. vectorEffect: die Linie
              bleibt ein Haar, auch wenn preserveAspectRatio="none" die
              Grafik in die Breite zieht. */}
          {achse.linien.map((m) => (
            <line
              key={m}
              x1={0}
              x2={WIDTH}
              y1={y(m)}
              y2={y(m)}
              style={{ stroke: "var(--color-border)" }}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
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
        {/* Beschriftung der Höhenlinien als HTML über der Grafik: Text in
            einem verzerrten SVG würde mitverzerrt. Nur in der grossen
            Fassung — in 112 px Höhe wären die Zahlen Rauschen. */}
        {gross &&
          achse.linien.map((m) => (
            <span
              key={m}
              aria-hidden="true"
              className="pointer-events-none absolute right-0 -translate-y-full pb-0.5 text-xs leading-none tabular-nums text-muted"
              style={{ top: `${(y(m) / HEIGHT) * 100}%` }}
            >
              {m.toLocaleString("de-CH")}
            </span>
          ))}
      </div>
      {/* Start · höchster Punkt · Ziel, statt Minimum · Gipfel · Maximum.
          Der Gipfel IST das Maximum — rechts stand also zweimal dieselbe
          Zahl, und an der Stelle, an der man das Streckenende erwartet,
          las sie sich als Zielhöhe, während die Linie darüber abfiel. */}
      {/* Der Messwert unter dem Finger steht in derselben Zeile wie Start,
          höchster Punkt und Ziel und ersetzt sie, solange gewischt wird.
          Vorher lag eine Blase unter der Kurve — genau über dieser Zeile,
          sodass der Wert die Werte verdeckte, mit denen man ihn vergleicht.
          Über der Kurve ging nicht: dort liegt "Strecke starten". */}
      {hoverPunkt ? (
        <p className="text-center text-xs font-medium tabular-nums text-foreground">
          {formatMeter(hoverPunkt.m)} · km {hoverPunkt.km.toFixed(1)}
        </p>
      ) : (
        <div className="flex justify-between gap-2 whitespace-nowrap text-xs tabular-nums text-muted">
          <span>Start {formatMeter(punkte[0].m)}</span>
          <span className="truncate text-center">
            Höchster Punkt {formatMeter(gipfel.m)} · km {gipfel.km.toFixed(0)}
          </span>
          <span className="text-right">Ziel {formatMeter(punkte[punkte.length - 1].m)}</span>
        </div>
      )}
      {/* Beleg statt Behauptung: Routenprofile kommen von swisstopo
          swissALTI3D (lib/elevation.ts), Fahrtenprofile nur bei Quelle
          swisstopo — sonst steht hier ehrlich "geschaetzt" bzw. bei
          unbekannter Herkunft (NULL) gar nichts. */}
      {quelle === "swisstopo" ? (
        <p className="text-xs text-muted">Höhen: swisstopo swissALTI3D</p>
      ) : quelle === "geschaetzt" ? (
        <p className="text-xs text-muted">Höhen: geschätzt</p>
      ) : null}
    </div>
  );
}
