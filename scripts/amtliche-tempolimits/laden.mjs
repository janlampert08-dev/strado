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
export function wfsGml({ url, typename, attribut, kmh = Number }) {
  return async () => {
    // Bestehende Parameter (ogcserver=… bei den Geoportal-Proxys) bleiben.
    const q = new URL(url);
    for (const [k, v] of Object.entries({
      SERVICE: "WFS",
      VERSION: "1.1.0",
      REQUEST: "GetFeature",
      TYPENAME: typename,
      SRSNAME: "EPSG:2056",
    })) q.searchParams.set(k, v);
    const xml = await holen(q.toString(), "text");
    const out = [];
    for (const [block] of xml.matchAll(/<gml:featureMember>[\s\S]*?<\/gml:featureMember>/g)) {
      const wert = block.match(new RegExp(`<[a-z]+:${attribut}>([^<]*)<`))?.[1];
      const linien = [...block.matchAll(/<gml:posList[^>]*>([^<]*)</g)].map(([, liste]) => {
        const zahlen = liste.trim().split(/\s+/).map(Number);
        const punkte = [];
        for (let i = 0; i + 1 < zahlen.length; i += 2) punkte.push([zahlen[i], zahlen[i + 1]]);
        return punkte;
      });
      const v = wert == null || wert === "" ? null : kmh(wert);
      if (v != null && linien.length) out.push({ kmh: v, linien });
    }
    return out;
  };
}

// ArcGIS REST (MapServer/FeatureServer-Layer), seitenweise über
// resultOffset. Esri-JSON statt f=geojson, weil ältere Server (Stadt Bern,
// 10.91) GeoJSON nicht zuverlässig mit outSR kombinieren.
export function arcgis({ layerUrl, feld, kmh = Number, seite = 1000 }) {
  return async () => {
    const out = [];
    for (let offset = 0; ; offset += seite) {
      const q = new URL(`${layerUrl}/query`);
      q.search = new URLSearchParams({
        where: "1=1",
        outFields: feld,
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
        const v = wert == null ? null : kmh(wert);
        if (v == null || !f.geometry) continue;
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
export function wfsGeoJsonWgs84({ url, typename, format, kmh }) {
  const q = new URL(url);
  for (const [k, v] of Object.entries({ SERVICE: "WFS", VERSION: "1.1.0", REQUEST: "GetFeature", TYPENAME: typename, OUTPUTFORMAT: format })) {
    q.searchParams.set(k, v);
  }
  return geojsonDownload({ url: q.toString(), kmh, wgs84: true });
}

// Opendatasoft-Export (Stadt St. Gallen) — nur in WGS84 verfügbar.
export function opendatasoft({ url, kmh }) {
  return geojsonDownload({ url, kmh, wgs84: true });
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
