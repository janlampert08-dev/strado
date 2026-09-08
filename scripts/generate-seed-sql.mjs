// Baut aus den GeoJSON-Linien (fetch-routes.mjs) und Höhenkennzahlen
// (enrich-routes.mjs) die finale Seed-SQL-Datei für Phase 3.
// Nutzung: node scripts/generate-seed-sql.mjs [key ...] > supabase/seed/<datei>.sql
// Ohne Key werden alle Einträge aus META ausgegeben.

import { readFile } from "node:fs/promises";

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

// Redaktionelle Metadaten je Route — Geometrie/Länge/Höhe kommen aus den
// Overpass-/Elevation-Skripten, der Rest ist von Hand kuratiert.
const META = {
  albispass: {
    name: "Albispass",
    region: "Zürich",
    start_ort: "Adliswil",
    ziel_ort: "Hausen am Albis",
    kategorien: ["kurvig", "passstrasse"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Kurvige, dicht bewaldete Höhenstrasse über den Albiskamm südlich von Zürich.",
  },
  forch: {
    name: "Forch-Höhenstrasse",
    region: "Zürich",
    start_ort: "Zumikon",
    ziel_ort: "Esslingen",
    kategorien: ["scenic", "freie_fahrt"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Aussichtsreiche Höhenstrasse mit Blick über den Zürichsee, beliebte Feierabendrunde.",
  },
  uetliberg: {
    name: "Uetliberg",
    region: "Zürich",
    start_ort: "Zürich Triemli",
    ziel_ort: "Uetliberg (Uto Kulm)",
    kategorien: ["kurvig", "scenic"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Kurze, kurvige Auffahrt auf den Zürcher Hausberg mit Panoramablick über die Stadt.",
  },
  reusstal: {
    name: "Reusstal",
    region: "Aargau/Zürich",
    start_ort: "Sins",
    ziel_ort: "Bremgarten",
    kategorien: ["scenic", "freie_fahrt"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Flache, kurvenreiche Strecke entlang der Reuss durchs Freiamt ohne grössere Steigungen.",
  },
  // ---------------------------------------------------------------------
  // Lokale Runden im Stadtgebiet (Geometrie aus fetch-lokale-strecken.mjs).
  // Kurz, quartiersnah und alltagstauglich — dieselbe Idee wie "Dietlikon
  // Dash": eine Runde, die man nach Feierabend fährt, ohne aus der Stadt zu
  // fahren.
  // ---------------------------------------------------------------------
  "oerliker-orbit": {
    name: "Oerliker Orbit",
    region: "Kanton Zürich",
    start_ort: "Zürich Oerlikon",
    ziel_ort: "Zürich Oerlikon",
    kategorien: ["freie_fahrt"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Runde um Oerlikon: vom Bahnhof durch Neu-Oerlikon in den Glattpark und über die Schaffhauserstrasse zurück.",
  },
  "seebach-sprint": {
    name: "Seebach Sprint",
    region: "Kanton Zürich",
    start_ort: "Zürich Seebach",
    ziel_ort: "Zürich Seebach",
    kategorien: ["freie_fahrt"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Über die Birchstrasse nordwärts nach Glattbrugg und zurück — der schnellste Abschnitt liegt ausserorts.",
  },
  "aussersihl-cruise": {
    name: "Aussersihl Cruise",
    region: "Kanton Zürich",
    start_ort: "Zürich Aussersihl",
    ziel_ort: "Zürich Aussersihl",
    kategorien: [],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Stadtrunde durch den Kreis 4 und über die Kalkbreite. Durchgehend Tempo 30/50 und voller Einbahnen — hier zählt der Charakter, nicht das Tempo.",
  },
  "hoengger-hoehenzug": {
    name: "Höngger Höhenzug",
    region: "Kanton Zürich",
    start_ort: "Zürich Höngg",
    ziel_ort: "Zürich Höngg",
    kategorien: ["kurvig", "scenic"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Von der Limmat hinauf auf die Höngger Terrasse, durch die Rebberge nach Frankental und zurück zum Meierhofplatz.",
  },
  "schwamendinger-schlaufe": {
    name: "Schwamendinger Schlaufe",
    region: "Kanton Zürich",
    start_ort: "Zürich Schwamendingen",
    ziel_ort: "Zürich Schwamendingen",
    kategorien: ["freie_fahrt"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Über die Überlandstrasse nach Osten und über die Weststrasse zurück — die schnellen Achsen am nordöstlichen Stadtrand.",
  },
  "witiker-runde": {
    name: "Witiker Runde",
    region: "Kanton Zürich",
    start_ort: "Zürich Witikon",
    ziel_ort: "Zürich Witikon",
    kategorien: ["kurvig", "scenic"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Höhenrunde über Witikon und den Zollikerberg: die Forchstrasse hinauf, durchs Trichtenhausertal und über die Katzenschwanzstrasse zurück.",
  },
  "zimmerberg-rundfahrt": {
    name: "Zimmerberg-Rundfahrt",
    region: "Zürich",
    start_ort: "Zürich",
    ziel_ort: "Zürich",
    kategorien: ["kurvig", "scenic", "passstrasse"],
    saison_status: "ganzjaehrig",
    charakter_text:
      "Rundfahrt ab Zürich: flach durchs Sihltal nach Süden, kurvige Rückfahrt über den Albispass.",
  },
};

function sqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

function toWkt(coords) {
  return `LINESTRING(${coords.map(([lon, lat]) => `${lon} ${lat}`).join(",")})`;
}

async function buildInsert(key) {
  const meta = META[key];
  if (!meta) throw new Error(`Keine Metadaten für ${key}`);

  const geojson = JSON.parse(await readFile(`scripts/output/${key}.geojson`, "utf8"));
  const coords = geojson.geometry.coordinates;
  const stats = JSON.parse(await readFile(`scripts/output/${key}.stats.json`, "utf8"));
  const tempolimits = JSON.parse(
    await readFile(`scripts/output/${key}.tempolimits.json`, "utf8"),
  );

  const laengeKm = Number(pathLengthKm(coords).toFixed(1));
  const maxSteigung = meta.max_steigung_prozent ?? stats.maxSteigung;
  const start = coords[0];
  const end = coords[coords.length - 1];
  const kategorienArr = `ARRAY[${meta.kategorien.map(sqlString).join(",")}]::text[]`;
  const tempolimitsJson = JSON.stringify(tempolimits).replace(/'/g, "''");
  // kehren und hoehenprofil kommen aus enrich-routes.mjs. Das Höhenprofil ist
  // nicht nur Deko: LiveTrackingForm interpoliert daraus die aktuelle Höhe
  // während der Aufzeichnung (lib/elevation.ts, interpolateElevation), und
  // ohne es bleibt dieses Feld auf einer Strecke leer.
  const hoehenprofilJson = stats.hoehenprofil
    ? `'${JSON.stringify(stats.hoehenprofil).replace(/'/g, "''")}'::jsonb`
    : "null";

  return `insert into public.routes (
  name, region, start_ort, ziel_ort,
  start_coord, ziel_coord, geometry,
  hoehe_m, laenge_km, max_steigung_prozent, kehren,
  kategorien, saison_status, status_ok, charakter_text,
  tempolimits, hoehenprofil, erstellt_von
) values (
  ${sqlString(meta.name)}, ${sqlString(meta.region)}, ${sqlString(meta.start_ort)}, ${sqlString(meta.ziel_ort)},
  ST_GeogFromText('SRID=4326;POINT(${start[0]} ${start[1]})'),
  ST_GeogFromText('SRID=4326;POINT(${end[0]} ${end[1]})'),
  ST_GeogFromText('SRID=4326;${toWkt(coords)}'),
  ${stats.hoeheM}, ${laengeKm}, ${maxSteigung}, ${stats.kehren ?? "null"},
  ${kategorienArr}, ${sqlString(meta.saison_status)}, true, ${sqlString(meta.charakter_text)},
  '${tempolimitsJson}'::jsonb, ${hoehenprofilJson}, null
);`;
}

async function main() {
  const gewaehlt = process.argv.slice(2);
  const keys = gewaehlt.length ? gewaehlt : Object.keys(META);
  const statements = [];
  for (const key of keys) statements.push(await buildInsert(key));

  console.log(`-- Seed-Daten: ${keys.join(", ")}.`);
  console.log("-- Geometrie aus scripts/output/<key>.geojson: je nach Strecke von");
  console.log("-- fetch-routes.mjs (Overpass + Dijkstra), fetch-loop-route.mjs (Mapbox");
  console.log("-- Directions) oder fetch-lokale-strecken.mjs (OSRM). Höhe, Steigung,");
  console.log("-- Kehren und Höhenprofil von enrich-routes.mjs (swisstopo swissALTI3D),");
  console.log("-- Tempolimits aus OSM, wo verfügbar ergänzt um den amtlichen");
  console.log("-- Kantonsdatensatz (enrich-zh-tempolimits.mjs).");
  console.log("-- Generiert von scripts/generate-seed-sql.mjs — nicht von Hand bearbeiten,");
  console.log("-- stattdessen META in diesem Skript anpassen und neu generieren.\n");
  console.log(statements.join("\n\n"));
}

main();
