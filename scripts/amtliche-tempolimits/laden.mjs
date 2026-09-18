// Lader für die Dienst-Typen, in denen Kantone und Städte ihre
// Tempolimit-Daten veröffentlichen (WFS mit GeoJSON oder nur GML,
// ArcGIS REST, GeoJSON-Download, GeoPackage im ZIP, Opendatasoft).
//
// Jeder Lader liefert dieselbe normalisierte Form, in LV95-Metern:
//   { kmh, linien: [[x, y][]] }   für Liniendaten entlang der Strassenachse
//   { kmh, flaechen: [[x, y][][]] } für Zonen (ein Polygon = Liste von Ringen)
// kmh wird von der Quelle über `kmh(properties)` gelesen; null heisst
// "kein befahrbares Tempolimit" (Fahrverbot, Fussgängerzone) und fällt weg.

import { inflateRawSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { wgs84ToLv95 } from "../../lib/tempolimitAbgleich.ts";

// Manche städtischen Server (Bern) sperren Anfragen ohne Browser-Kennung.
const USER_AGENT = "Mozilla/5.0 (compatible; strado-amtliche-tempolimits/1.0; +https://strado.ch)";
// Overpass weist genau solche Browser-Kennungen ab (HTTP 406) und verlangt
// eine, die den Aufrufer nennt.
const OVERPASS_USER_AGENT = "strado-tempolimits/1.0 (contact@strado.ch)";

async function holen(url, als = "json") {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  if (als === "json") return res.json();
  if (als === "text") return res.text();
  return Buffer.from(await res.arrayBuffer());
}

function zuFeature(geometry, kmh, umrechnen) {
  if (kmh == null || !geometry) return null;
  const p = umrechnen ? (c) => wgs84ToLv95(c) : (c) => [c[0], c[1]];
  switch (geometry.type) {
    case "LineString":
      return { kmh, linien: [geometry.coordinates.map(p)] };
    case "MultiLineString":
      return { kmh, linien: geometry.coordinates.map((l) => l.map(p)) };
    case "Polygon":
      return { kmh, flaechen: [geometry.coordinates.map((r) => r.map(p))] };
    case "MultiPolygon":
      return { kmh, flaechen: geometry.coordinates.map((poly) => poly.map((r) => r.map(p))) };
    default:
      return null;
  }
}

function sammeln(features, kmh, umrechnen = false) {
  return features.map((f) => zuFeature(f.geometry, kmh(f.properties ?? {}), umrechnen)).filter(Boolean);
}

// WFS 2.0 mit GeoJSON-Ausgabe, seitenweise (count/startIndex), weil
// mehrere Server ein stilles Feature-Maximum pro Antwort haben.
export function wfsGeoJson({ url, typename, kmh, version = "2.0.0", seite = 1000, format = "application/json" }) {
  return async () => {
    const out = [];
    for (let start = 0; ; start += seite) {
      const q = new URL(url);
      const v1 = version.startsWith("1.");
      q.search = new URLSearchParams({
        service: "WFS",
        version,
        request: "GetFeature",
        [v1 ? "typename" : "typenames"]: typename,
        [v1 ? "maxFeatures" : "count"]: String(seite),
        startIndex: String(start),
        outputFormat: format,
        srsName: "EPSG:2056",
      }).toString();
      const json = await holen(q.toString());
      const features = json.features ?? [];
      out.push(...sammeln(features, kmh));
      if (features.length < seite) break;
    }
    return out;
  };
}

// MapServer-WFS, das nur GML ausgibt (Schwyz, Graubünden, Jura). Die Antworten sind
// flach genug für einen regulären Ausdruck: ein featureMember je Abschnitt,
// darin gml:posList-Blöcke und das Geschwindigkeitsattribut als Element.
export function wfsGml({ url, typename, attribut, kmh = Number, version = "1.1.0", flaeche = false, ausschluss }) {
  return async () => {
    // Bestehende Parameter (ogcserver=… bei den Geoportal-Proxys) bleiben.
    const q = new URL(url);
    for (const [k, v] of Object.entries({
      SERVICE: "WFS",
      VERSION: version,
      REQUEST: "GetFeature",
      TYPENAME: typename,
      SRSNAME: "EPSG:2056",
    })) q.searchParams.set(k, v);
    const xml = await holen(q.toString(), "text");
    const out = [];
    // WFS 1.1 verpackt jedes Objekt in gml:featureMember, WFS 2.0 in wfs:member.
    for (const [block] of xml.matchAll(/<(?:gml:featureMember|wfs:member)>[\s\S]*?<\/(?:gml:featureMember|wfs:member)>/g)) {
      // Ohne `attribut` entscheidet der Layer über den Wert (Zonentyp-Layer),
      // dann bekommt kmh() einen leeren String.
      if (ausschluss?.(block)) continue;
      const wert = attribut ? block.match(new RegExp(`<[A-Za-z0-9]+:${attribut}>([^<]*)<`, "i"))?.[1] : "";
      const ringe = [...block.matchAll(/<gml:posList[^>]*>([^<]*)</g)].map(([, liste]) => {
        const zahlen = liste.trim().split(/\s+/).map(Number);
        const punkte = [];
        for (let i = 0; i + 1 < zahlen.length; i += 2) punkte.push([zahlen[i], zahlen[i + 1]]);
        return punkte;
      });
      const v = wert == null ? null : kmh(wert);
      if (v == null || !ringe.length) continue;
      // Flächenquellen liefern denselben posList-Aufbau; ein Ring je Polygon.
      out.push(flaeche ? { kmh: v, flaechen: ringe.map((r) => [r]) } : { kmh: v, linien: ringe });
    }
    return out;
  };
}

// ArcGIS REST (MapServer/FeatureServer-Layer), seitenweise über
// resultOffset. Esri-JSON statt f=geojson, weil ältere Server (Stadt Bern,
// 10.91) GeoJSON nicht zuverlässig mit outSR kombinieren.
export function arcgis({ layerUrl, feld, felder, kmh = Number, seite = 1000 }) {
  return async () => {
    const out = [];
    for (let offset = 0; ; offset += seite) {
      const q = new URL(`${layerUrl}/query`);
      q.search = new URLSearchParams({
        where: "1=1",
        outFields: felder ?? feld,
        returnGeometry: "true",
        outSR: "2056",
        resultOffset: String(offset),
        resultRecordCount: String(seite),
        orderByFields: "OBJECTID",
        f: "json",
      }).toString();
      const json = await holen(q.toString());
      if (json.error) throw new Error(`ArcGIS: ${JSON.stringify(json.error)}`);
      for (const f of json.features ?? []) {
        const wert = f.attributes?.[feld];
        const v = wert == null ? null : kmh(wert, f.attributes);
        if (v == null || !Number.isFinite(v) || !f.geometry) continue;
        if (f.geometry.paths) out.push({ kmh: v, linien: f.geometry.paths.map((l) => l.map(([x, y]) => [x, y])) });
        if (f.geometry.rings) out.push({ kmh: v, flaechen: esriRingeGruppieren(f.geometry.rings) });
      }
      if (!json.exceededTransferLimit && (json.features?.length ?? 0) < seite) break;
    }
    return out;
  };
}

// Esri-Polygone sind eine flache Ringliste: Aussenringe laufen im
// Uhrzeigersinn, Löcher dagegen und folgen ihrem Aussenring. Für PostGIS
// müssen sie zu echten Polygonen gruppiert werden — eine flache Liste als
// ein Polygon wäre ungültig, sobald sie zwei Aussenringe enthält.
function esriRingeGruppieren(rings) {
  const polygone = [];
  for (const ring of rings) {
    const r = ring.map(([x, y]) => [x, y]);
    let flaeche = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) flaeche += (r[i][0] - r[j][0]) * (r[i][1] + r[j][1]);
    const aussen = flaeche > 0; // Shoelace-Variante: positiv = Uhrzeigersinn
    if (aussen || polygone.length === 0) polygone.push([r]);
    else polygone[polygone.length - 1].push(r);
  }
  return polygone;
}

// Direkter GeoJSON-Download. `schluessel` für Dateien, die die
// FeatureCollection unter einem Layernamen verschachteln (Biel).
export function geojsonDownload({ url, kmh, schluessel, wgs84 = false }) {
  return async () => {
    const json = await holen(url);
    const fc = schluessel ? json[schluessel] : json;
    return sammeln(fc.features ?? [], kmh, wgs84);
  };
}

// WFS mit GeoJSON nur in WGS84 (Zug, Schaffhausen), ohne Seitenweise-Abfrage.
export function wfsGeoJsonWgs84({ url, typename, format, kmh, version = "1.1.0", zusatz = {} }) {
  const q = new URL(url);
  const typParam = version.startsWith("1.") ? "TYPENAME" : "TYPENAMES";
  for (const [k, v] of Object.entries({ SERVICE: "WFS", VERSION: version, REQUEST: "GetFeature", [typParam]: typename, OUTPUTFORMAT: format, ...zusatz })) {
    q.searchParams.set(k, v);
  }
  return geojsonDownload({ url: q.toString(), kmh, wgs84: true });
}

// Opendatasoft-Export (Stadt St. Gallen) — nur in WGS84 verfügbar.
export function opendatasoft({ url, kmh }) {
  return geojsonDownload({ url, kmh, wgs84: true });
}

// --- OpenStreetMap (Overpass) --------------------------------------------

// Schweizer Standardwerte hinter den symbolischen maxspeed-Angaben (SSV
// Art. 4a): Autobahn 120, Autostrasse 100, ausserorts 80, innerorts 50.
const OSM_SYMBOLISCH = {
  "ch:motorway": 120,
  "ch:trunk": 100,
  "ch:rural": 80,
  "ch:urban": 50,
};

// maxspeed ist ein Freitextfeld. Verwertbar sind reine Zahlen und die
// symbolischen Schweizer Werte; "none", "walk", "variable", "signals" und
// Angaben in mph sagen nichts über ein Limit in km/h aus. Bei mehreren
// Werten ("50;80", nach Fahrtrichtung oder Fahrzeugart) gilt der erste.
export function osmMaxspeed(roh) {
  if (!roh) return null;
  const wert = String(roh).trim().toLowerCase().split(";")[0].trim();
  if (OSM_SYMBOLISCH[wert]) return OSM_SYMBOLISCH[wert];
  const zahl = /^(\d+)$/.exec(wert);
  return zahl ? Number(zahl[1]) : null;
}

// Alle Strassen der Schweiz mit maxspeed-Tag, kachelweise von der
// Overpass-API. Eine Anfrage über das ganze Land läuft in die Zeitgrenze des
// öffentlichen Servers, 0,5°-Kacheln brauchen je rund eine Sekunde.
// Wege ohne Autoverkehr (Fuss- und Radwege) bleiben draussen.
export function overpassMaxspeed({
  bbox = [45.8, 5.9, 47.85, 10.55], // [süd, west, nord, ost]
  kachel = 0.5,
  spiegel = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"],
} = {}) {
  return async () => {
    const [sued, west, nord, ost] = bbox;
    const out = [];
    const gesehen = new Set(); // Wege an Kachelgrenzen kommen doppelt
    for (let s = sued; s < nord; s += kachel) {
      for (let w = west; w < ost; w += kachel) {
        const n = Math.min(s + kachel, nord);
        const o = Math.min(w + kachel, ost);
        const abfrage =
          `[out:json][timeout:180];\n` +
          `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified)(_link)?$"]` +
          `["maxspeed"](${s.toFixed(3)},${w.toFixed(3)},${n.toFixed(3)},${o.toFixed(3)});\nout geom;`;
        // Overpass ist ein Gemeinschaftsdienst mit Kontingent: 429 heisst
        // "zu schnell", nicht "kaputt". Also warten und nochmals fragen,
        // und zwischen den Kacheln ohnehin kurz Pause machen.
        let json;
        for (let versuch = 1; ; versuch++) {
          // Abwechselnd die Spiegel: fällt einer aus, läuft der Lauf weiter.
          const ziel = spiegel[(versuch - 1) % spiegel.length];
          let grund;
          try {
            const res = await fetch(ziel, {
              method: "POST",
              body: "data=" + encodeURIComponent(abfrage),
              headers: { "User-Agent": OVERPASS_USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
            });
            if (res.ok) {
              json = await res.json();
              break;
            }
            // 429 heisst "zu schnell", 504 "gerade überlastet" — beides geht
            // vorbei; alles andere ist ein echter Fehler.
            if (res.status !== 429 && res.status !== 504) throw new Error(`HTTP ${res.status}`);
            grund = `HTTP ${res.status}`;
          } catch (err) {
            // Abgebrochene Verbindungen kommen bei Läufen über 40 Kacheln vor.
            grund = err.message;
          }
          if (versuch > 6) throw new Error(`Overpass ${grund} für Kachel ${s},${w}`);
          await new Promise((r) => setTimeout(r, versuch * 15_000));
        }
        await new Promise((r) => setTimeout(r, 2_000));
        for (const e of json.elements ?? []) {
          if (gesehen.has(e.id) || !e.geometry?.length) continue;
          gesehen.add(e.id);
          const kmh = osmMaxspeed(e.tags?.maxspeed);
          if (kmh == null) continue;
          out.push({ kmh, linien: [e.geometry.map((p) => wgs84ToLv95([p.lon, p.lat]))] });
        }
      }
    }
    return out;
  };
}

// --- GeoPackage im ZIP (Kanton Aargau) -----------------------------------

// Minimaler ZIP-Leser über das zentrale Verzeichnis; eine Abhängigkeit nur
// für diese eine Quelle lohnt sich nicht.
function zipEintrag(buf, endung) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Kein ZIP-Verzeichnis gefunden");
  const anzahl = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < anzahl; i++) {
    const methode = buf.readUInt16LE(p + 10);
    const groesse = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const kommentarLen = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name.endsWith(endung)) {
      const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
      const daten = buf.subarray(start, start + groesse);
      return methode === 0 ? daten : inflateRawSync(daten);
    }
    p += 46 + nameLen + extraLen + kommentarLen;
  }
  throw new Error(`Keine *${endung}-Datei im ZIP`);
}

// GeoPackage-Geometrie: "GP"-Kopf mit optionaler Hülle, danach WKB. Nur
// (Multi)LineString wird gebraucht; Z/M-Werte werden überlesen.
function gpkgLinien(blob) {
  const b = Buffer.from(blob);
  const flags = b[3];
  const huelle = [0, 32, 48, 48, 64][(flags >> 1) & 0b111] ?? 0;
  const linien = [];
  let p = 8 + huelle;

  function lesen() {
    const le = b[p] === 1;
    p += 1;
    const u32 = () => {
      const v = le ? b.readUInt32LE(p) : b.readUInt32BE(p);
      p += 4;
      return v;
    };
    const f64 = () => {
      const v = le ? b.readDoubleLE(p) : b.readDoubleBE(p);
      p += 8;
      return v;
    };
    let typ = u32();
    let dim = 2;
    // EWKB-Flags (0x80000000 Z, 0x40000000 M) und ISO-Codes (+1000/2000/3000)
    if (typ & 0x80000000) dim++;
    if (typ & 0x40000000) dim++;
    typ &= 0x0fffffff;
    if (typ >= 3000) { dim = 4; typ -= 3000; }
    else if (typ >= 2000) { dim = 3; typ -= 2000; }
    else if (typ >= 1000) { dim = 3; typ -= 1000; }
    if (typ === 2) {
      const n = u32();
      const punkte = [];
      for (let i = 0; i < n; i++) {
        const x = f64();
        const y = f64();
        p += 8 * (dim - 2);
        punkte.push([x, y]);
      }
      linien.push(punkte);
    } else if (typ === 5) {
      const n = u32();
      for (let i = 0; i < n; i++) lesen();
    } else {
      throw new Error(`WKB-Typ ${typ} nicht unterstützt`);
    }
  }

  lesen();
  return linien;
}

export function geopackageZip({ url, tabelle, feld }) {
  return async () => {
    const gpkg = zipEintrag(await holen(url, "buffer"), ".gpkg");
    // node:sqlite öffnet nur Dateien, daher kurz auf die Platte.
    const dir = await mkdtemp(path.join(tmpdir(), "strado-gpkg-"));
    const datei = path.join(dir, "daten.gpkg");
    try {
      await writeFile(datei, gpkg);
      const db = new DatabaseSync(datei, { readOnly: true });
      const name =
        tabelle ?? db.prepare("select table_name from gpkg_contents where data_type = 'features'").get().table_name;
      const spalte = db.prepare("select column_name from gpkg_geometry_columns where table_name = ?").get(name).column_name;
      const zeilen = db.prepare(`select "${spalte}" as g, "${feld}" as v from "${name}"`).all();
      db.close();
      return zeilen
        .filter((z) => z.g && Number.isFinite(Number(z.v)))
        .map((z) => ({ kmh: Number(z.v), linien: gpkgLinien(z.g) }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
