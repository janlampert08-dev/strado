// Was an der Stelle der Karte steht, solange ihr Code (mapbox-gl, der
// grösste Brocken der App) noch lädt. Vorher eine flache graue Fläche für
// drei bis sechs Sekunden, ohne jedes Zeichen, dass dort etwas kommt
// (Re-Review 2026-09-23). Jetzt angedeutete Höhenlinien und eine leise
// Zeile — dieselbe Bildsprache wie das Höhenprofil, damit der Übergang zur
// echten Karte (Relief und Höhenlinien, lib/kartenStil.ts) nicht springt.
//
// Keine Animation der Linien: bewegte Höhenlinien wären Dekoration. Nur der
// Punkt vor "Karte lädt" pulsiert, und das nur ohne reduzierte Bewegung.
export default function KartePlatzhalter() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-surface" aria-busy="true">
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full text-foreground opacity-[0.07]"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <path d="M60 210c30-60 90-90 150-80s110 50 130 20 20-80 60-90" />
        <path d="M40 240c40-70 110-100 170-90s100 50 140 25 30-90 70-100" />
        <path d="M20 270c50-80 130-110 190-100s90 50 150 30 40-100 80-110" />
        <path d="M150 150c20-30 60-40 90-25s40 45 10 60-80 10-100-35z" />
        <path d="M170 150c12-18 38-24 58-15s26 28 6 38-52 6-64-23z" />
        <path d="M190 150c6-9 18-12 28-7s12 14 3 19-25 3-31-12z" />
        <path d="M-10 120c40-20 80-10 110-40s40-70 90-60" />
        <path d="M-10 95c40-20 75-15 100-45s40-60 85-55" />
      </svg>
      <p className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 text-xs text-muted">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted motion-safe:animate-pulse" />
        Karte lädt
      </p>
    </div>
  );
}
