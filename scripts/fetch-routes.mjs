// Lädt echte Streckengeometrie für die Seed-Routen von der Overpass-API (OSM)
// und fügt einzelne Way-Segmente zu einer durchgehenden Linie zusammen.
//
// Nutzung: node scripts/fetch-routes.mjs [routeKey]
// Ohne Argument werden alle Routen aus ROUTES verarbeitet.
// Ergebnis: scripts/output/<key>.geojson + Konsolen-Report (Länge vs. Erwartung).

import { writeFile } from "node:fs/promises";
import path from "node:path";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// bbox: [south, west, north, east]
// ref: Schweizer Kantons-/Hauptstrassen-Nummer (robuster als "name", weil
// derselbe Streckenverlauf über mehrere Ortsdurchfahrten hinweg oft je
// Ortschaft anders benannt ist, aber denselben "ref" trägt).
const ROUTES = [
  {
    key: "julierpass",
    ref: "3",
    bbox: [46.4, 9.5, 46.7, 9.85],
    start: [9.5763, 46.6317], // Tiefencastel [lon, lat]
    end: [9.7975, 46.4703], // Silvaplana
    expectedKm: 42,
  },
  {
    key: "klausenpass",
    ref: "17",
    bbox: [46.83, 8.75, 46.95, 9.05],
    start: [8.8425, 46.8865], // Unterschächen
    end: [8.9958, 46.9167], // Linthal
    expectedKm: 47,
  },
  {
    key: "sustenpass",
    ref: "11",
    bbox: [46.6, 8.15, 46.78, 8.65],
    start: [8.5988, 46.7075], // Wassen
    end: [8.2308, 46.7108], // Innertkirchen
    expectedKm: 46,
  },
  {
    key: "fluelapass",
    ref: "28",
    bbox: [46.7, 9.75, 46.85, 10.1],
    start: [9.836, 46.8099], // Davos
    end: [10.0645, 46.7386], // Susch
    expectedKm: 42,
  },
  {
    key: "albispass",
    anyRoad: true,
    highwayClasses: ["trunk", "primary", "secondary", "tertiary", "unclassified", "residential"],
    bbox: [47.2, 8.45, 47.32, 8.56],
    start: [8.5245, 47.3103], // Adliswil
    end: [8.5192, 47.2352], // Hausen am Albis
    expectedKm: 14,
  },
  {
    key: "forch",
    anyRoad: true,
    highwayClasses: ["trunk", "primary", "secondary", "tertiary", "unclassified"],
    bbox: [47.25, 8.55, 47.35, 8.75],
    start: [8.6199, 47.3242], // Zumikon
    end: [8.6822, 47.2841], // Esslingen
    expectedKm: 11,
  },
  {
    key: "uetliberg",
    anyRoad: true,
    highwayClasses: ["secondary", "tertiary", "unclassified", "residential", "track", "service"],
    bbox: [47.335, 8.47, 47.365, 8.5],
    start: [8.4876, 47.372], // Triemlistrasse (Talstation)
    end: [8.4978, 47.3459], // oberster erreichbarer Punkt Richtung Uto Kulm
    expectedKm: 8,
  },
  {
    key: "reusstal",
    anyRoad: true,
    highwayClasses: ["trunk", "primary", "secondary", "tertiary", "unclassified"],
    bbox: [47.15, 8.3, 47.36, 8.45],
    start: [8.4383, 47.1867], // Sins
    end: [8.3423, 47.3502], // Bremgarten
    expectedKm: 18,
  },
];

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

function pathLengthKm(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total / 1000;
}

function escapeRegex(x) {
  return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Schweizer Ausserorts-Standard, falls ein Way kein maxspeed-Tag trägt
// (auf Passstrassen häufig, v. a. ausserhalb von Ortschaften).
const DEFAULT_KMH_CH = 80;

function parseMaxspeed(tags) {
  const raw = tags?.maxspeed;
  if (!raw) return { kmh: DEFAULT_KMH_CH, bekannt: false };

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return { kmh: numeric, bekannt: true };

  // Implizite Schweizer Werte, siehe OSM-Wiki "Switzerland/Roads".
  const implicit = { "CH:urban": 50, "CH:rural": 80, "CH:motorway": 120, "CH:trunk": 100 };
  if (raw in implicit) return { kmh: implicit[raw], bekannt: true };

  return { kmh: DEFAULT_KMH_CH, bekannt: false };
}

async function overpassQuery(route) {
  const [s, w, n, e] = route.bbox;
  const highwayClasses = route.highwayClasses ?? ["trunk", "primary", "secondary"];
  const highwayFilter = `["highway"~"^(${highwayClasses.join("|")})$"]`;
  const filter = route.anyRoad
    ? ""
    : route.ref
      ? `["ref"~"(^|;)${escapeRegex(route.ref)}(;|$)"]`
      : `["name"~"^(${route.names.map(escapeRegex).join("|")})$"]`;
  const ql = `
    [out:json][timeout:90];
    way${highwayFilter}${filter}(${s},${w},${n},${e});
    out geom;
  `;
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 5000 * attempt));
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "strado-route-seed/1.0 (lampert.jan@icloud.com)",
          Accept: "*/*",
        },
        body: ql,
      });
      if (!res.ok) {
        lastError = new Error(`Overpass HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      return json.elements ?? [];
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Baut aus allen gefundenen Ways einen Straßengraphen (Knoten = OSM-Node-IDs,
// Kanten = aufeinanderfolgende Way-Punkte). Greedy-Endpunkt-Matching scheitert
// bei Pässen: Serpentinen haben geografisch nahe, aber unverbundene Endpunkte,
// und Tunnel/alte Streckenführung erzeugen echte Verzweigungen. Der kürzeste
// Pfad per Dijkstra über den echten OSM-Graphen löst beides korrekt.
function buildGraph(elements) {
  const coordOf = new Map();
  const adj = new Map();
  const maxspeedOf = new Map(); // `${a}|${b}` (beide Richtungen) -> {kmh, bekannt}
  const ways = elements.filter(
    (el) => el.type === "way" && Array.isArray(el.geometry) && Array.isArray(el.nodes),
  );

  for (const w of ways) {
    const speed = parseMaxspeed(w.tags);
    for (let i = 0; i < w.nodes.length; i++) {
      coordOf.set(w.nodes[i], [w.geometry[i].lon, w.geometry[i].lat]);
    }
    for (let i = 0; i < w.nodes.length - 1; i++) {
      const a = w.nodes[i];
      const b = w.nodes[i + 1];
      const d = haversine(coordOf.get(a), coordOf.get(b));
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push({ to: b, dist: d });
      adj.get(b).push({ to: a, dist: d });
      maxspeedOf.set(`${a}|${b}`, speed);
      maxspeedOf.set(`${b}|${a}`, speed);
    }
  }

  return { coordOf, adj, maxspeedOf, wayCount: ways.length };
}

// Fasst die Tempolimits entlang eines Node-Pfads zu Abschnitten
// {km_von, km_bis, kmh, bekannt} zusammen (aufeinanderfolgende Kanten mit
// gleichem Wert werden gemergt statt pro Way-Segment auszugeben).
function buildSpeedSegments(nodePath, coordOf, maxspeedOf) {
  if (nodePath.length < 2) return [];

  const segments = [];
  let cumKm = 0;
  let current = null;

  for (let i = 0; i < nodePath.length - 1; i++) {
    const a = nodePath[i];
    const b = nodePath[i + 1];
    const distKm = haversine(coordOf.get(a), coordOf.get(b)) / 1000;
    const speed = maxspeedOf.get(`${a}|${b}`) ?? { kmh: DEFAULT_KMH_CH, bekannt: false };

    if (current && current.kmh === speed.kmh && current.bekannt === speed.bekannt) {
      current.km_bis = cumKm + distKm;
    } else {
      current = {
        km_von: Number(cumKm.toFixed(2)),
        km_bis: Number((cumKm + distKm).toFixed(2)),
        kmh: speed.kmh,
        bekannt: speed.bekannt,
      };
      segments.push(current);
    }
    cumKm += distKm;
  }

  return segments.map((s) => ({ ...s, km_bis: Number(s.km_bis.toFixed(2)) }));
}

// Liefert die Node-IDs der größten zusammenhängenden Komponente. Kurze
// Strassen sind in OSM oft an den Ortsein-/ausfahrten in einem separaten,
// anders benannten Stück getaggt (z. B. "Dorfstrasse" statt "Albisstrasse")
// und dadurch vom eigentlichen Streckenverlauf getrennt. Die Endpunktsuche
// auf die Hauptkomponente zu beschränken verhindert, dass Start/Ziel in so
// einem kurzen, isolierten Stub landen.
function largestComponent(adj) {
  const visited = new Set();
  let best = [];
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const comp = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const cur = queue.shift();
      comp.push(cur);
      for (const { to } of adj.get(cur) ?? []) {
        if (!visited.has(to)) {
          visited.add(to);
          queue.push(to);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return new Set(best);
}

function nearestNode(coordOf, point, allowedIds = null) {
  let bestId = null;
  let bestDist = Infinity;
  for (const [id, c] of coordOf) {
    if (allowedIds && !allowedIds.has(id)) continue;
    const d = haversine(c, point);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return { id: bestId, dist: bestDist };
}

// Einfaches O(V²)-Dijkstra — für ein paar tausend Knoten pro Route ausreichend schnell.
function dijkstra(adj, sourceId, targetId) {
  const dist = new Map([[sourceId, 0]]);
  const prev = new Map();
  const unvisited = new Set(adj.keys());
  unvisited.add(sourceId);
  unvisited.add(targetId);

  while (unvisited.size) {
    let u = null;
    let uDist = Infinity;
    for (const id of unvisited) {
      const d = dist.has(id) ? dist.get(id) : Infinity;
      if (d < uDist) {
        uDist = d;
        u = id;
      }
    }
    if (u === null) break;
    unvisited.delete(u);
    if (u === targetId) break;

    for (const { to, dist: w } of adj.get(u) ?? []) {
      if (!unvisited.has(to)) continue;
      const alt = uDist + w;
      if (alt < (dist.has(to) ? dist.get(to) : Infinity)) {
        dist.set(to, alt);
        prev.set(to, u);
      }
    }
  }

  if (!dist.has(targetId)) return null;
  const path = [targetId];
  let cur = targetId;
  while (cur !== sourceId) {
    cur = prev.get(cur);
    if (cur === undefined) return null;
    path.push(cur);
  }
  path.reverse();
  return path;
}

async function processRoute(route) {
  const elements = await overpassQuery(route);
  const { coordOf, adj, maxspeedOf, wayCount } = buildGraph(elements);

  const mainComponent = largestComponent(adj);
  const source = nearestNode(coordOf, route.start, mainComponent);
  const target = nearestNode(coordOf, route.end, mainComponent);
  const nodePath = source.id && target.id ? dijkstra(adj, source.id, target.id) : null;
  const coords = nodePath ? nodePath.map((id) => coordOf.get(id)) : [];
  const speedSegments = nodePath ? buildSpeedSegments(nodePath, coordOf, maxspeedOf) : [];

  const lengthKm = pathLengthKm(coords);
  const distStart = coords.length ? haversine(coords[0], route.start) : Infinity;
  const distEnd = coords.length ? haversine(coords[coords.length - 1], route.end) : Infinity;
  const avgKmh = speedSegments.length
    ? Math.round(
        speedSegments.reduce((sum, s) => sum + s.kmh * (s.km_bis - s.km_von), 0) / lengthKm,
      )
    : null;

  const report = {
    key: route.key,
    wayCount,
    nodes: coordOf.size,
    points: coords.length,
    lengthKm: Number(lengthKm.toFixed(1)),
    expectedKm: route.expectedKm,
    distStartM: Math.round(distStart),
    distEndM: Math.round(distEnd),
    avgKmh,
  };

  if (coords.length > 1) {
    const geojson = {
      type: "Feature",
      properties: { key: route.key },
      geometry: { type: "LineString", coordinates: coords },
    };
    await writeFile(
      path.join("scripts/output", `${route.key}.geojson`),
      JSON.stringify(geojson),
    );
    await writeFile(
      path.join("scripts/output", `${route.key}.tempolimits.json`),
      JSON.stringify(speedSegments),
    );
  }

  return report;
}

async function main() {
  const filterKey = process.argv[2];
  const routes = filterKey ? ROUTES.filter((r) => r.key === filterKey) : ROUTES;

  const reports = [];
  for (const route of routes) {
    console.error(`Fetching ${route.key}...`);
    try {
      reports.push(await processRoute(route));
    } catch (err) {
      reports.push({ key: route.key, error: String(err) });
    }
    // Overpass-Ratelimit freundlich behandeln.
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.table(reports);
}

main();
