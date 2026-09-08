// Baut die Geometrie der kuratierten *lokalen* Strecken (kurze Stadt- und
// Quartierrunden im Raum Zürich, in der Art von "Dietlikon Dash").
//
// Warum ein eigenes Skript neben fetch-routes.mjs und fetch-loop-route.mjs:
//
//   - fetch-routes.mjs (Overpass + Dijkstra) ist für Punkt-zu-Punkt-Pässe
//     entlang *einer* Strassennummer gebaut. Eine Quartierrunde wechselt
//     mit jedem Wegpunkt die Strasse und beginnt dort, wo sie endet —
//     Dijkstra von Start nach Ziel liefert dafür den leeren Pfad.
//   - fetch-loop-route.mjs kann Schleifen, braucht dafür aber einen
//     Mapbox-Token (NEXT_PUBLIC_MAPBOX_TOKEN aus .env.local). Dieses Skript
//     kommt ohne Zugangsdaten aus, damit die Seed-Daten auch ohne
//     Projekt-Secrets reproduzierbar sind.
//
// Datenquellen (alle ohne API-Key, alle mit Overrides für den Fall, dass
// eine Instanz nicht erreichbar ist):
//
//   - OSRM (Strassenrouting, folgt Einbahnen und Fahrverboten) liefert die
//     Geometrie.
//   - Overpass liefert die maxspeed-Tags der Strassen im Umkreis der Route.
//     Voreingestellt ist die Schweizer Instanz overpass.osm.ch
//     (fetch-routes.mjs nutzt overpass-api.de — beide sprechen dieselbe API).
//
// Die Zuordnung Route -> maxspeed läuft geometrisch (nächstes Way-Segment,
// Peilung muss passen) und NICHT über die OSM-Node-IDs, die OSRM per
// annotations=nodes mitliefern könnte. Der naheliegende exakte Weg über die
// IDs scheitert an den Daten: die öffentliche OSRM-Demo läuft auf einem
// älteren Planet-Auszug als die Overpass-Instanz, Ways werden zwischendurch
// neu aufgeteilt, und dadurch fand ein Test für die Kreis-4-Runde 112 von
// 274 Knotenpaaren in Overpass gar nicht wieder. Der geometrische Abgleich
// traf dieselbe Runde vollständig, bei einem Median-Abstand von 0 m.
//
// Nutzung: node scripts/fetch-lokale-strecken.mjs [key ...]
// Ergebnis: scripts/output/<key>.geojson + <key>.tempolimits.json — dasselbe
// Dateiformat, das enrich-routes.mjs und generate-seed-sql.mjs erwarten.

import { writeFile } from "node:fs/promises";
import path from "node:path";

const OSRM_URL = process.env.OSRM_URL ?? "https://router.project-osrm.org";
const OVERPASS_URL = process.env.OVERPASS_URL ?? "https://overpass.osm.ch/api/interpreter";

// Schweizer Innerorts-Standard, falls ein Way kein maxspeed-Tag trägt. In
// fetch-routes.mjs steht an dieser Stelle 80 (Ausserorts) — diese Strecken
// liegen aber praktisch vollständig innerorts, und 80 wäre dort die deutlich
// falschere Annahme. Segmente aus diesem Fallback werden mit bekannt=false
// markiert und in der App entsprechend anders dargestellt.
const DEFAULT_KMH_INNERORTS = 50;

// Wegpunkte je Strecke ([lon, lat]). Erster und letzter Punkt sind bei einer
// Runde identisch. Die Zwischenpunkte sind bewusst grosszügig gesetzt: OSRM
// verbindet sie über das echte Strassennetz, sie sollen die Runde nur in die
// gewünschte Richtung zwingen, nicht den Verlauf Meter für Meter vorgeben.
const LOKALE_STRECKEN = {
  "oerliker-orbit": {
    // Zürich Oerlikon (Kreis 11): Bahnhof → Neu-Oerlikon → Glattpark →
    // Leutschenbach → zurück über die Schaffhauserstrasse.
    waypoints: [
      [8.5445, 47.4118], // Bahnhof Oerlikon
      [8.5405, 47.4143], // Birch-/Binzmühlestrasse
      [8.5536, 47.4166], // Thurgauerstrasse
      [8.5620, 47.4188], // Glattparkstrasse
      [8.557, 47.4148], // Hagenholzstrasse
      [8.558, 47.4106], // Wallisellenstrasse
      [8.5479, 47.4034], // Berninaplatz
      [8.5445, 47.4118],
    ],
    expectedKm: 9,
  },
  "seebach-sprint": {
    // Zürich Seebach (Kreis 11): über die Birchstrasse Richtung Glattbrugg
    // und zurück — der Nordteil ist ausserorts und entsprechend schneller.
    waypoints: [
      [8.5487, 47.4247], // Bahnhof Seebach
      [8.5502, 47.4313], // Birchstrasse Nord
      [8.5537, 47.4385], // Flughofstrasse
      [8.5574, 47.435], // Europastrasse
      [8.5567, 47.4207], // Thurgauerstrasse
      [8.5468, 47.4269], // Glatttalstrasse
      [8.5487, 47.4247],
    ],
    expectedKm: 8,
  },
  "aussersihl-cruise": {
    // Zürich Aussersihl (Kreis 4) mit dem Zipfel Kreis 3 an der Kalkbreite:
    // Helvetiaplatz → Zurlindenstrasse → Hardstrasse → Hohlstrasse →
    // Militärstrasse → Langstrasse → zurück. Durchgehend Tempo 30/50 und
    // voller Einbahnen — die Runde lebt vom Stadtcharakter, nicht vom Tempo.
    //
    // Der Weg über die Kalkbreite ist kein Umweg aus Geschmacksgründen: die
    // Langstrasse zwischen Bäcker- und Militärstrasse ist von 05:30 bis
    // 22:00 für Autos und Motorräder gesperrt. Eine Runde, die dort
    // durchführt, wäre tagsüber nicht befahrbar; die Wegpunkte führen die
    // Route deshalb bewusst darum herum. Der Guard in processRoute prüft
    // das nach.
    waypoints: [
      [8.5265, 47.3775], // Helvetiaplatz
      [8.5168, 47.3727], // Kalkbreitestrasse
      [8.5183, 47.3706], // Zurlindenstrasse
      [8.5124, 47.3803], // Hardstrasse
      [8.523, 47.3805], // Hohlstrasse
      [8.5297, 47.3785], // Militärstrasse
      [8.5252, 47.3756], // Stauffacherstrasse
      [8.5265, 47.3775],
    ],
    expectedKm: 6,
  },
  "hoengger-hoehenzug": {
    // Zürich Höngg (Kreis 10): die Terrasse über der Limmat — hinunter ans
    // Wasser, über Winzer- und Frankentalerstrasse durch die Rebberge nach
    // Frankental und über die Regensdorferstrasse zurück auf den
    // Meierhofplatz.
    //
    // Die naheliegendere Runde über den Käferberg-Kamm (Emil-Klöti-Strasse
    // hinüber zur Waidbadstrasse) gibt es nicht: zwischen den beiden Strassen
    // liegt nur ein Waldweg, und Hönggerbergring wie Wolfgang-Pauli-Strasse
    // sind mit motor_vehicle=no getaggt. OSRM nimmt den Waldweg trotzdem —
    // der abseits-Guard in processRoute hat genau das aufgedeckt.
    waypoints: [
      [8.4997, 47.4019], // Meierhofplatz Höngg
      [8.5028, 47.3975], // Am Wasser
      [8.4894, 47.4021], // Winzerstrasse
      [8.48, 47.4099], // Frankentalerstrasse
      [8.4887, 47.4103], // Regensdorferstrasse
      [8.4997, 47.4019],
    ],
    expectedKm: 7,
  },
  "schwamendinger-schlaufe": {
    // Zürich Schwamendingen (Kreis 12) und Wallisellen: Überlandstrasse
    // ostwärts, zurück über die Weststrasse.
    waypoints: [
      [8.5739, 47.4049], // Winterthurerstrasse
      [8.5877, 47.4067], // Ueberlandstrasse
      [8.5947, 47.4083], // Neue Winterthurerstrasse
      [8.5806, 47.4137], // Weststrasse
      [8.5703, 47.4118], // Aubruggstrasse
      [8.5739, 47.4049],
    ],
    expectedKm: 8,
  },
  "witiker-runde": {
    // Zürich Witikon (Kreis 7) und der Zollikerberg: Forchstrasse hinauf,
    // durchs Trichtenhausertal und über die Katzenschwanzstrasse zurück.
    //
    // Die ursprünglich geplante sechste Runde lag am Katzensee (Affoltern).
    // Sie ist gestrichen: jede Variante dort führte über den Büsiseeweg und
    // einen weiteren Flurweg — zusammen rund 1,4 km, die OSRM als Abkürzung
    // nimmt und die für den allgemeinen Motorfahrzeugverkehr nicht offen
    // sind. Ein durchgehend befahrener Ring in dieser Grössenordnung
    // existiert dort schlicht nicht.
    waypoints: [
      [8.5876, 47.3617], // Witikon, Witikonerstrasse
      [8.6009, 47.3675], // Trichtenhausen
      [8.6083, 47.3548], // Zollikerberg
      [8.5836, 47.3494], // Katzenschwanzstrasse
      [8.5876, 47.3617],
    ],
    expectedKm: 12,
  },
};

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

async function withRetry(label, fn) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 4000 * attempt));
    try {
      return await fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`${label}: ${lastError}`);
}

// continue_straight=false ist für Runden zwingend: sonst darf OSRM an einem
// Wegpunkt nicht wenden und legt stattdessen eine zusätzliche Schleife durchs
// Quartier ein, um wieder in Fahrtrichtung zu kommen.
async function fetchDrivingRoute(waypoints) {
  const coordsParam = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const url =
    `${OSRM_URL}/route/v1/driving/${coordsParam}` +
    `?geometries=geojson&overview=full&continue_straight=false`;

  return withRetry("OSRM", async () => {
    const res = await fetch(url, { headers: { "User-Agent": "strado-route-seed/1.0 (contact@strado.ch)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== "Ok" || !json.routes?.[0]) throw new Error(`OSRM code ${json.code}`);
    return json.routes[0];
  });
}

function parseMaxspeed(tags) {
  const raw = tags?.maxspeed;
  if (!raw) return { kmh: DEFAULT_KMH_INNERORTS, bekannt: false };

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return { kmh: numeric, bekannt: true };

  // Implizite Schweizer Werte, siehe OSM-Wiki "Switzerland/Roads".
  const implicit = { "CH:urban": 50, "CH:rural": 80, "CH:motorway": 120, "CH:trunk": 100 };
  if (raw in implicit) return { kmh: implicit[raw], bekannt: true };

  return { kmh: DEFAULT_KMH_INNERORTS, bekannt: false };
}

function bboxOf(coords, paddingDeg = 0.005) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const [lon, lat] of coords) {
    if (lat < s) s = lat;
    if (lat > n) n = lat;
    if (lon < w) w = lon;
    if (lon > e) e = lon;
  }
  return [s - paddingDeg, w - paddingDeg, n + paddingDeg, e + paddingDeg];
}

function bearing([lon1, lat1], [lon2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// Richtungsunterschied ohne Vorzeichen und ohne Fahrtrichtung: eine Strecke
// darf einen Way auch entgegen seiner OSM-Digitalisierungsrichtung befahren,
// 180 Grad Unterschied ist deshalb dieselbe Strasse.
function achsenDifferenz(a, b) {
  const d = Math.abs(a - b) % 360;
  const gerichtet = d > 180 ? 360 - d : d;
  return gerichtet > 90 ? 180 - gerichtet : gerichtet;
}

// Abstand Punkt -> Strecke in Metern. Longitude wird mit cos(lat) gestaucht,
// damit die Projektion in Zürich (~47 Grad Nord) nicht verzerrt; über die
// wenigen hundert Meter, um die es hier geht, ist das genau genug.
function abstandTilM(p, a, b) {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const px = p[0] * k, ax = a[0] * k, bx = b[0] * k;
  const vx = bx - ax, vy = b[1] - a[1];
  const laengeQuadrat = vx * vx + vy * vy;
  let t = laengeQuadrat ? ((px - ax) * vx + (p[1] - a[1]) * vy) / laengeQuadrat : 0;
  t = Math.max(0, Math.min(1, t));
  return haversine(p, [(ax + t * vx) / k, a[1] + t * vy]);
}

// Klassen, deren maxspeed für eine Strecke zählt. Ohne diese Einschränkung
// gewinnt in der Stadt regelmässig ein parallel verlaufender Fuss-/Radweg das
// Nächster-Nachbar-Rennen, und die Strecke bekäme dessen (fehlendes)
// Tempolimit.
const BEFAHRBARE_KLASSEN = [
  "motorway", "trunk", "primary", "secondary", "tertiary",
  "unclassified", "residential", "living_street",
  "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
];

// Erschliessungswege (Parkplatzzufahrten, Hofzufahrten) tragen kein
// Tempolimit und sollen deshalb nicht in den Tempo-Abgleich, gelten aber als
// Strasse: eine Strecke, die kurz über eine solche Zufahrt läuft, ist nicht
// "abseits der Strasse".
const ERSCHLIESSUNGS_KLASSEN = ["service"];

const GRID_GRAD = 0.002; // ~150m — genug, dass ein Nachbarfeld-Scan reicht
const MAX_ABSTAND_M = 25;
// Aufschlag für ein Way-Segment, das quer zur Fahrtrichtung liegt: die
// kreuzende Strasse ist am Knoten genauso nah wie die befahrene, hat aber
// oft ein anderes Limit.
const PEILUNGS_AUFSCHLAG_M = 40;
const MAX_PEILUNGS_DIFFERENZ = 35;
// Ab wann ein Abschnitt als "abseits der Strasse" gilt: keine Strasse mehr in
// diesem Umkreis, dafür ein Feld-/Fussweg direkt darunter.
const ABSEITS_STRASSE_MIN_M = 20;
const ABSEITS_MAX_M = 10;
// Wie viele Meter abseits der Strasse eine Strecke insgesamt haben darf,
// bevor sie abgelehnt wird — nur Toleranz für den Abgleich an Einmündungen.
const MAX_ABSEITS_M = 100;

// Lädt die Strassen im Umkreis der Route und legt ihre Segmente in ein
// grobes Gitter, damit die Suche unten nicht über alle Ways laufen muss.
async function fetchStrassenGitter(coords) {
  const [s, w, n, e] = bboxOf(coords);
  // Bewusst *alle* highway-Klassen, nicht nur die befahrbaren: die
  // Feldwege und Fusswege werden für den Tempo-Abgleich zwar ignoriert,
  // aber gebraucht, um zu erkennen, dass eine Route über sie führt (siehe
  // abseitsMeter unten).
  const ql = `[out:json][timeout:90];way["highway"](${s},${w},${n},${e});out geom;`;

  const elements = await withRetry("Overpass", async () => {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": "strado-route-seed/1.0 (contact@strado.ch)",
      },
      body: ql,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).elements ?? [];
  });

  const gitter = new Map();
  let wayCount = 0;
  for (const el of elements) {
    if (el.type !== "way" || !Array.isArray(el.geometry)) continue;
    wayCount++;
    const speed = parseMaxspeed(el.tags);
    const klasse = el.tags?.highway;
    const befahrbar = BEFAHRBARE_KLASSEN.includes(klasse);
    const strasse = befahrbar || ERSCHLIESSUNGS_KLASSEN.includes(klasse);
    for (let i = 0; i < el.geometry.length - 1; i++) {
      const a = [el.geometry[i].lon, el.geometry[i].lat];
      const b = [el.geometry[i + 1].lon, el.geometry[i + 1].lat];
      const segment = { a, b, speed, befahrbar, strasse, peilung: bearing(a, b), tags: el.tags ?? {} };
      for (const p of [a, b]) {
        const zelle = `${Math.floor(p[0] / GRID_GRAD)}:${Math.floor(p[1] / GRID_GRAD)}`;
        if (!gitter.has(zelle)) gitter.set(zelle, []);
        if (!gitter.get(zelle).includes(segment)) gitter.get(zelle).push(segment);
      }
    }
  }
  return { gitter, wayCount };
}

// Sucht zu einem Routenabschnitt die passenden OSM-Way-Segmente. Gesucht
// wird zweimal über dieselben Kandidaten: einmal nur unter den befahrbaren
// Klassen (davon kommt das Tempolimit) und einmal über alle (daran hängt die
// Frage, ob die Route überhaupt auf einer Strasse liegt). Massgeblich ist
// jeweils der kleinste Abstand, wobei quer liegende Segmente einen Aufschlag
// bekommen.
function wegeFuerAbschnitt(gitter, von, bis) {
  const mitte = [(von[0] + bis[0]) / 2, (von[1] + bis[1]) / 2];
  const peilung = bearing(von, bis);
  const cx = Math.floor(mitte[0] / GRID_GRAD);
  const cy = Math.floor(mitte[1] / GRID_GRAD);

  let befahrbar = null;
  let befahrbarBewertung = Infinity;
  let strasseAbstand = Infinity;
  let abseits = null;
  let abseitsAbstand = Infinity;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const segment of gitter.get(`${cx + dx}:${cy + dy}`) ?? []) {
        const abstand = abstandTilM(mitte, segment.a, segment.b);
        if (abstand > MAX_ABSTAND_M) continue;
        const quer = achsenDifferenz(peilung, segment.peilung) > MAX_PEILUNGS_DIFFERENZ;

        if (segment.strasse) {
          if (abstand < strasseAbstand) strasseAbstand = abstand;
        } else if (abstand < abseitsAbstand) {
          abseitsAbstand = abstand;
          abseits = segment;
        }

        if (!segment.befahrbar) continue;
        const bewertung = abstand + (quer ? PEILUNGS_AUFSCHLAG_M : 0);
        if (bewertung < befahrbarBewertung) {
          befahrbarBewertung = bewertung;
          befahrbar = segment;
        }
      }
    }
  }

  // Ein Trottoir oder Radstreifen liegt nur wenige Meter neben der Fahrbahn,
  // deshalb reicht "ein Fussweg ist nah" nicht als Befund. Erst wenn im
  // Umkreis gar keine Strasse mehr liegt und stattdessen ein Feld-/Fussweg
  // direkt unter der Route, liegt die Route wirklich abseits.
  const liegtAbseits =
    strasseAbstand > ABSEITS_STRASSE_MIN_M && abseitsAbstand < ABSEITS_MAX_M ? abseits : null;

  return { befahrbar, abseits: liegtAbseits };
}

// Zeitlich beschränkte Fahrverbote (…:conditional). OSRM wertet sie nicht
// aus und routet mitten durch, was in Zürich real vorkommt: die Langstrasse
// zwischen Militär- und Bäckerstrasse trägt
// "motorcar:conditional = no @ 05:30-22:00", ist also tagsüber für Autos
// gesperrt. Eine Strecke, die dort durchführt, wäre 16 Stunden am Tag nicht
// befahrbar — deshalb meldet processRoute solche Abschnitte, statt sie
// stillschweigend in die Seed-Daten zu schreiben.
const BEDINGTE_SCHLUESSEL = [
  "motorcar:conditional",
  "motorcycle:conditional",
  "motor_vehicle:conditional",
  "vehicle:conditional",
  "access:conditional",
];

function bedingteEinschraenkung(tags) {
  for (const key of BEDINGTE_SCHLUESSEL) {
    const wert = tags?.[key];
    if (wert && !/^(yes|designated|permissive)\b/.test(wert)) {
      return `${tags.name ?? "(unbenannt)"}: ${key}=${wert}`;
    }
  }
  return null;
}

// Fasst die Tempolimits entlang der Route zu Abschnitten
// {km_von, km_bis, kmh, bekannt} zusammen — dasselbe Format wie in
// fetch-routes.mjs/fetch-loop-route.mjs und in types/database.ts.
function buildSpeedSegments(coords, gitter) {
  const segments = [];
  let cumKm = 0;
  let current = null;
  let unbekanntKm = 0;
  let abseitsKm = 0;
  const konflikte = new Map();
  const abseitsWege = new Map();

  for (let i = 0; i < coords.length - 1; i++) {
    const distKm = haversine(coords[i], coords[i + 1]) / 1000;
    const { befahrbar, abseits } = wegeFuerAbschnitt(gitter, coords[i], coords[i + 1]);
    const speed = befahrbar?.speed ?? { kmh: DEFAULT_KMH_INNERORTS, bekannt: false };
    if (!speed.bekannt) unbekanntKm += distKm;

    const konflikt = befahrbar && bedingteEinschraenkung(befahrbar.tags);
    if (konflikt) konflikte.set(konflikt, (konflikte.get(konflikt) ?? 0) + distKm * 1000);

    if (abseits) {
      const text = `${abseits.tags.name ?? "(unbenannt)"}: highway=${abseits.tags.highway}`;
      abseitsWege.set(text, (abseitsWege.get(text) ?? 0) + distKm * 1000);
      abseitsKm += distKm;
    }

    if (current && current.kmh === speed.kmh && current.bekannt === speed.bekannt) {
      current.km_bis = Number((cumKm + distKm).toFixed(2));
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

  const beschriften = (map) =>
    [...map.entries()].map(([text, meter]) => `${text} (${Math.round(meter)} m)`).sort();

  return {
    segments,
    unbekanntKm,
    abseitsKm,
    konflikte: beschriften(konflikte),
    abseitsWege: beschriften(abseitsWege),
  };
}

async function processRoute(key, definition) {
  const route = await fetchDrivingRoute(definition.waypoints);
  const coords = route.geometry.coordinates;

  const { gitter, wayCount } = await fetchStrassenGitter(coords);
  const { segments, unbekanntKm, abseitsKm, konflikte, abseitsWege } =
    buildSpeedSegments(coords, gitter);

  // Ein zeitliches Fahrverbot auf der Route ist ein Abbruchgrund, kein
  // Hinweis: die Strecke gehört so nicht in den Seed. Die Wegpunkte müssen
  // dann so gesetzt werden, dass die Route den Abschnitt umfährt.
  if (konflikte.length) {
    throw new Error(`Bedingtes Fahrverbot auf der Route — ${konflikte.join("; ")}`);
  }

  // Genauso hart: OSRM nimmt am Stadtrand bereitwillig Feldwege, wenn sie
  // ein paar hundert Meter sparen. Ein asphaltierter Flurweg sieht in der
  // Route aus wie eine Strasse, ist aber in aller Regel für den allgemeinen
  // Motorfahrzeugverkehr gesperrt und gehört in keine kuratierte Strecke.
  // Die Toleranz fängt nur den Messfehler an Einmündungen ab.
  if (abseitsKm * 1000 > MAX_ABSEITS_M) {
    throw new Error(
      `${Math.round(abseitsKm * 1000)} m abseits der Strasse — ${abseitsWege.join("; ")}`,
    );
  }

  const lengthKm = pathLengthKm(coords);
  const avgKmh = lengthKm
    ? Math.round(segments.reduce((sum, s) => sum + s.kmh * (s.km_bis - s.km_von), 0) / lengthKm)
    : null;
  const geschlossenM = Math.round(haversine(coords[0], coords[coords.length - 1]));

  await writeFile(
    path.join("scripts/output", `${key}.geojson`),
    JSON.stringify({
      type: "Feature",
      properties: { key },
      geometry: { type: "LineString", coordinates: coords },
    }),
  );
  await writeFile(
    path.join("scripts/output", `${key}.tempolimits.json`),
    JSON.stringify(segments),
  );

  return {
    key,
    wayCount,
    points: coords.length,
    lengthKm: Number(lengthKm.toFixed(1)),
    expectedKm: definition.expectedKm,
    // Bei einer Runde muss der letzte Punkt wieder auf dem ersten liegen.
    geschlossenM,
    segmente: segments.length,
    avgKmh,
    unbekanntProzent: Number(((unbekanntKm / lengthKm) * 100).toFixed(1)),
  };
}

async function main() {
  const requested = process.argv.slice(2);
  const keys = requested.length ? requested : Object.keys(LOKALE_STRECKEN);

  const reports = [];
  for (const key of keys) {
    const definition = LOKALE_STRECKEN[key];
    if (!definition) {
      reports.push({ key, error: "unbekannter Key" });
      continue;
    }
    console.error(`Fetching ${key}...`);
    try {
      reports.push(await processRoute(key, definition));
    } catch (err) {
      reports.push({ key, error: String(err) });
    }
    // OSRM-Demo- und Overpass-Instanzen freundlich behandeln.
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.table(reports);
}

main();
