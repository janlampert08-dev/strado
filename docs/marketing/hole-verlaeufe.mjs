// Holt die Streckenverlaeufe aus der oeffentlichen API und schreibt
// verlaeufe.mjs. Aufruf:  node docs/marketing/hole-verlaeufe.mjs
//
// Warum ueber die API und nicht aus supabase/seed/: die Seed-Dateien tragen
// vier andere, aeltere Strecken (Albispass, Forch, Uetliberg, Reusstal) —
// nicht die, die in der App stehen. /api/strecken ist unauthentifiziert,
// read-only und liefert genau die freigegebenen Strecken (siehe
// app/api/strecken/[id]/route.ts, Feld geometry). Kein SQL, kein Zugriff auf
// etwas, das nicht ohnehin jeder Browser lesen darf.
//
// Vereinfacht wird mit Douglas-Peucker: 695 Punkte fuer den Zuerichberg sind
// fuer eine 830 px breite Zeichnung sinnlos genau und blaehen die Datei auf.
// Die Toleranz ist in Metern angegeben und so gewaehlt, dass die Abweichung
// unter einem gezeichneten Pixel bleibt.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STRECKEN } from "./instagram/daten.mjs";
import { mercator } from "./gemeinsam.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const BASIS = process.env.STRADO_API ?? "https://app.strado.ch";
const TOLERANZ_M = 12;

// Abstand Punkt/Strecke, quadriert.
function abstand2(p, a, b) {
  const [px, py] = p; let [x, y] = a;
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}

function douglasPeucker(punkte, toleranz) {
  if (punkte.length < 3) return punkte;
  const t2 = toleranz * toleranz;
  const behalten = new Array(punkte.length).fill(false);
  behalten[0] = behalten[punkte.length - 1] = true;
  const stapel = [[0, punkte.length - 1]];
  while (stapel.length) {
    const [erst, letzt] = stapel.pop();
    let maxD = 0, index = -1;
    for (let i = erst + 1; i < letzt; i++) {
      const d = abstand2(punkte[i], punkte[erst], punkte[letzt]);
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > t2 && index > 0) {
      behalten[index] = true;
      stapel.push([erst, index], [index, letzt]);
    }
  }
  return punkte.filter((_, i) => behalten[i]);
}

const hole = async (pfad) => {
  const antwort = await fetch(`${BASIS}${pfad}`);
  if (!antwort.ok) throw new Error(`${pfad}: HTTP ${antwort.status}`);
  return antwort.json();
};

// --- Lauf --------------------------------------------------------------------
const { routes } = await hole("/api/strecken");
const nachName = new Map(routes.map((r) => [r.name, r]));

const zeilen = [];
let gesamtVorher = 0, gesamtNachher = 0;

for (const [schluessel, s] of Object.entries(STRECKEN)) {
  const treffer = nachName.get(s.name);
  if (!treffer) {
    console.warn(`  ! ${s.name} steht nicht in der API — uebersprungen.`);
    continue;
  }
  const detail = await hole(`/api/strecken/${treffer.id}`);
  const roh = (detail.route ?? detail).geometry?.coordinates;
  if (!Array.isArray(roh) || roh.length < 2) {
    console.warn(`  ! ${s.name}: keine Geometrie — uebersprungen.`);
    continue;
  }

  // In Metern vereinfachen, danach wieder als lon/lat ablegen: die Zeichnung
  // projiziert selbst, und lon/lat bleibt die lesbare Form.
  const projiziert = roh.map(mercator);
  const behalten = new Set(
    douglasPeucker(projiziert.map((p, i) => [...p, i]), TOLERANZ_M).map((p) => p[2]),
  );
  const duenn = roh.filter((_, i) => behalten.has(i));

  gesamtVorher += roh.length;
  gesamtNachher += duenn.length;
  console.log(`  ${s.name.padEnd(22)} ${String(roh.length).padStart(4)} → ${duenn.length}`);

  const punkte = duenn
    .map(([lon, lat]) => `[${lon.toFixed(5)},${lat.toFixed(5)}]`)
    .join(",");
  zeilen.push(`  // ${s.name} — ${duenn.length} Punkte\n  ${schluessel}: [${punkte}],`);
}

const kopf = `// Streckenverlaeufe als [lon, lat] — NICHT von Hand pflegen.
//
// Erzeugt von hole-verlaeufe.mjs aus der oeffentlichen API von app.strado.ch
// und mit Douglas-Peucker auf ${TOLERANZ_M} m Toleranz ausgeduennt. Wer eine Strecke
// aendert oder ergaenzt, laesst das Skript neu laufen:
//
//   node docs/marketing/hole-verlaeufe.mjs
//
// Getrennt von instagram/daten.mjs, weil die Herkunft eine andere ist: dort
// stehen handgepflegte Kennzahlen, hier maschinell geholte Koordinaten.

export const VERLAEUFE = {
`;

await writeFile(join(HIER, "verlaeufe.mjs"), kopf + zeilen.join("\n") + "\n};\n");
console.log(`\n${zeilen.length} Verlaeufe, ${gesamtVorher} → ${gesamtNachher} Punkte, in verlaeufe.mjs`);
