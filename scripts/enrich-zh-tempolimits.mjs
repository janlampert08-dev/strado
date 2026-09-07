// Gleicht die Tempolimit-Segmente einer Strecke mit dem amtlichen WFS-
// Datensatz "Signalisierte Geschwindigkeit Kantonsstrasse" des Kantons
// Zürich ab (TBAGeschZHWFS, GDS 102 — deckt das Kantonsstrassennetz ab,
// EXKLUSIVE der Städte Zürich und Winterthur). Wo eine amtliche Zeile in
// GPS-Nähe (≤ 20m) der Streckengeometrie liegt, ersetzt ihr Wert die aus
// OSM/Mapbox geschätzte Zahl und wird als amtlich:true markiert.
//
// Nutzung: node scripts/enrich-zh-tempolimits.mjs <key>
// Erwartet scripts/output/<key>.geojson (Geometrie) und
// scripts/output/<key>.tempolimits.json (bisherige Segmente aus OSM/Mapbox).
// Überschreibt Letzteres mit der angereicherten Fassung.

import { readFile, writeFile } from "node:fs/promises";

const WFS_URL = "https://maps.zh.ch/wfs/TBAGeschZHWFS";
const MATCH_TOLERANZ_M = 20;

function haversine([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const CACHE_FILE = "scripts/output/_zh_geschwindigkeit_all.json";

// Der komplette Datensatz hat nur ca. 1600 Features — bbox-Filterung auf
// dem WFS lieferte trotz korrekter Koordinaten leere Resultate (vermutlich
// eine MapServer-Eigenheit dieser Instanz), daher einmalig den ganzen
// Datensatz laden und lokal cachen statt pro Strecke zu filtern.
async function fetchAllOfficialFeatures() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8")).features;
  } catch {
    // noch nicht gecacht
  }
  const url =
    `${WFS_URL}?service=WFS&version=2.0.0&request=GetFeature&typenames=ms:geschwindigkeit` +
    `&outputFormat=application/json&srsName=EPSG:4326&count=2000`;
  const res = await fetch(url, { headers: { "User-Agent": "strado-zh-tempolimit/1.0" } });
  if (!res.ok) throw new Error(`WFS HTTP ${res.status}`);
  const json = await res.json();
  await writeFile(CACHE_FILE, JSON.stringify(json));
  return json.features ?? [];
}

// Alle amtlichen Linien zu dicht liegenden Punkten (~10m) resampeln, damit
// die Nearest-Point-Suche unten nicht zwischen weit auseinanderliegenden
// Stützpunkten "durchrutscht".
function densifyOfficialPoints(features) {
  const points = [];
  for (const f of features) {
    const geschw = f.properties?.geschw;
    if (!geschw) continue;
    const coords = f.geometry?.coordinates ?? [];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const segLen = haversine(a, b);
      const steps = Math.max(1, Math.round(segLen / 10));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        points.push({
          lon: a[0] + (b[0] - a[0]) * t,
          lat: a[1] + (b[1] - a[1]) * t,
          kmh: geschw,
        });
      }
    }
  }
  return points;
}

// Kumulierte Distanz je Original-Stützpunkt (kein Neuabtasten nötig — die
// Streckengeometrie hat mit durchschnittlich <20m Punktabstand schon genug
// Auflösung für den Soll/Ist-Abgleich).
function cumulativeDistances(coords) {
  const out = [{ point: coords[0], distM: 0 }];
  let cum = 0;
  for (let i = 1; i < coords.length; i++) {
    cum += haversine(coords[i - 1], coords[i]);
    out.push({ point: coords[i], distM: cum });
  }
  return out;
}

async function main() {
  const key = process.argv[2];
  if (!key) throw new Error("Nutzung: node scripts/enrich-zh-tempolimits.mjs <key>");

  const geojson = JSON.parse(await readFile(`scripts/output/${key}.geojson`, "utf8"));
  const baseSegments = JSON.parse(
    await readFile(`scripts/output/${key}.tempolimits.json`, "utf8"),
  );
  const coords = geojson.geometry.coordinates;

  console.error(`Lade amtliche Daten (Kanton ZH)...`);
  const features = await fetchAllOfficialFeatures();
  console.error(`${features.length} amtliche Liniensegmente insgesamt (kantonsweit).`);
  const officialPoints = densifyOfficialPoints(features);

  // Für jeden Streckenpunkt den nächstgelegenen amtlichen Punkt suchen;
  // nur übernehmen, wenn er nah genug liegt.
  const sampled = cumulativeDistances(coords);
  const perPoint = sampled.map(({ point, distM }) => {
    let best = null;
    let bestDist = Infinity;
    for (const op of officialPoints) {
      const d = haversine(point, [op.lon, op.lat]);
      if (d < bestDist) {
        bestDist = d;
        best = op;
      }
    }
    if (best && bestDist <= MATCH_TOLERANZ_M) {
      return { km: distM / 1000, kmh: best.kmh, bekannt: true, amtlich: true };
    }
    // Fallback: bisherigen (OSM/Mapbox-)Wert für diese Kilometerposition nachschlagen.
    const km = distM / 1000;
    const fallback = baseSegments.find((s) => km >= s.km_von && km <= s.km_bis) ?? baseSegments[baseSegments.length - 1];
    return { km, kmh: fallback.kmh, bekannt: fallback.bekannt, amtlich: false };
  });

  // Aufeinanderfolgende gleiche Werte zu Segmenten zusammenfassen.
  const merged = [];
  for (const p of perPoint) {
    const last = merged[merged.length - 1];
    if (last && last.kmh === p.kmh && last.bekannt === p.bekannt && last.amtlich === p.amtlich) {
      last.km_bis = Number(p.km.toFixed(2));
    } else {
      merged.push({ km_von: Number(p.km.toFixed(2)), km_bis: Number(p.km.toFixed(2)), kmh: p.kmh, bekannt: p.bekannt, amtlich: p.amtlich });
    }
  }

  const amtlichKm = merged.filter((s) => s.amtlich).reduce((sum, s) => sum + (s.km_bis - s.km_von), 0);
  const totalKm = merged.length ? merged[merged.length - 1].km_bis : 0;
  console.table([{ key, segments: merged.length, amtlichKm: amtlichKm.toFixed(1), totalKm: totalKm.toFixed(1), anteilProzent: totalKm ? Math.round((amtlichKm / totalKm) * 100) : 0 }]);

  await writeFile(`scripts/output/${key}.tempolimits.json`, JSON.stringify(merged));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
