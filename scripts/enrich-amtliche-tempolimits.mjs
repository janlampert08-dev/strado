// Gleicht die Tempolimit-Segmente von Strecken mit den amtlichen Daten der
// Kantone und Städte ab (Verzeichnis: scripts/amtliche-tempolimits/quellen.mjs).
// Wo eine amtliche Angabe zur Streckengeometrie passt, ersetzt ihr Wert die
// aus OSM/Mapbox geschätzte Zahl und das Segment wird als amtlich:true
// markiert, mit der Quelle in `quelle`. Alles andere bleibt, wie es war.
//
// Nachfolger von enrich-zh-tempolimits.mjs, das nur den Kanton Zürich
// kannte. Der Abgleich selbst liegt in lib/tempolimitAbgleich.ts und ist
// derselbe, den proposeRoute() für neue Strecken nutzt.
//
// Nutzung (Node 24 lädt die .ts-Datei per Type-Stripping; --no-warnings
// unterdrückt den Hinweis dazu):
//   node scripts/enrich-amtliche-tempolimits.mjs --quellen
//       lädt alle Quellen, zeigt Anzahl und Werteverteilung (Funktionsprobe)
//   node --env-file=.env.local scripts/enrich-amtliche-tempolimits.mjs --hochladen [quelle ...]
//       schreibt alle (oder die genannten) Quellen in die Tabellen aus
//       0102 — die Datengrundlage für neue Strecken. Braucht den Secret Key.
//   node scripts/enrich-amtliche-tempolimits.mjs <key>
//       wie früher: scripts/output/<key>.geojson + <key>.tempolimits.json,
//       überschreibt Letzteres
//   node scripts/enrich-amtliche-tempolimits.mjs --live [id ...] > datei.sql
//       holt die freigegebenen Strecken über die öffentliche API und gibt
//       UPDATE-Anweisungen für jene aus, die amtliche Abschnitte gewinnen.
//       Spielt nichts ein — die SQL-Datei wird von Hand angewendet.
//
// Option --frisch ignoriert den Cache in scripts/output/_amtlich/.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { QUELLEN } from "./amtliche-tempolimits/quellen.mjs";
import {
  AmtlicherIndex,
  MAX_KMH,
  MIN_KMH,
  bbox,
  tempolimitsAbgleichen,
  wgs84ToLv95,
} from "../lib/tempolimitAbgleich.ts";

const CACHE_DIR = "scripts/output/_amtlich";
const API = process.env.STRADO_API ?? "https://app.strado.ch";

const frisch = process.argv.includes("--frisch");

// Berichte gehen nach stderr, damit --live sauberes SQL auf stdout schreibt.
const stderr = new console.Console(process.stderr);
const log = (...args) => stderr.log(...args);

// --- Quellen laden und indexieren -----------------------------------------

async function quelleLaden(quelle) {
  const datei = path.join(CACHE_DIR, `${quelle.id}.json`);
  if (!frisch) {
    try {
      return JSON.parse(await readFile(datei, "utf8"));
    } catch {
      // noch nicht gecacht
    }
  }
  const features = (await quelle.laden()).filter((f) => f.kmh >= MIN_KMH && f.kmh <= MAX_KMH);
  const alle = features.flatMap((f) => (f.linien ?? f.flaechen.flat()).flat());
  const daten = { geladen: new Date().toISOString(), bbox: alle.length ? bbox(alle) : null, features };
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(datei, JSON.stringify(daten));
  return daten;
}

// ids grenzt ein, welche Quellen überhaupt geladen werden — sonst zieht ein
// Hochladen einzelner Quellen jedes Mal auch alle übrigen nach.
async function alleQuellenLaden(ids = []) {
  const geladen = [];
  for (const quelle of QUELLEN.filter((q) => !ids.length || ids.includes(q.id))) {
    try {
      const daten = await quelleLaden(quelle);
      geladen.push({ quelle, daten });
      log(`  ${quelle.id.padEnd(24)} ${String(daten.features.length).padStart(6)} Objekte`);
    } catch (err) {
      // Ein ausgefallener Dienst darf die übrigen Kantone nicht blockieren.
      log(`  ${quelle.id.padEnd(24)} FEHLER: ${err.message}`);
    }
  }
  return geladen;
}

function bericht(name, segmente) {
  const gesamt = segmente.reduce((s, x) => s + (x.km_bis - x.km_von), 0);
  const proQuelle = {};
  for (const s of segmente.filter((x) => x.amtlich)) {
    proQuelle[s.quelle] = (proQuelle[s.quelle] ?? 0) + (s.km_bis - s.km_von);
  }
  const amtlich = Object.values(proQuelle).reduce((a, b) => a + b, 0);
  return {
    strecke: name,
    km: gesamt.toFixed(1),
    amtlichKm: amtlich.toFixed(1),
    anteil: `${gesamt ? Math.round((amtlich / gesamt) * 100) : 0}%`,
    quellen: Object.entries(proQuelle).map(([q, k]) => `${q} ${k.toFixed(1)}km`).join(", "),
  };
}

// Nur Quellen, deren Ausdehnung die Strecke berührt — spart beim Abgleich
// die ganze Schweiz für eine Zürcher Runde.
function indexFuer(geladen, coords) {
  const [minX, minY, maxX, maxY] = bbox(coords.map(wgs84ToLv95));
  const objekte = [];
  for (const { quelle, daten } of geladen) {
    const b = daten.bbox;
    if (!b || b[0] > maxX + 100 || b[2] < minX - 100 || b[1] > maxY + 100 || b[3] < minY - 100) continue;
    for (const f of daten.features) {
      objekte.push({ ...f, quelle: quelle.id, rang: quelle.rang, randM: quelle.randM ?? 0 });
    }
  }
  return new AmtlicherIndex(objekte);
}

// --- Modi ------------------------------------------------------------------

async function modusQuellen() {
  log("Lade amtliche Quellen...");
  const geladen = await alleQuellenLaden();
  console.table(
    geladen.map(({ quelle, daten }) => {
      const verteilung = {};
      for (const f of daten.features) verteilung[f.kmh] = (verteilung[f.kmh] ?? 0) + 1;
      return {
        quelle: quelle.id,
        art: quelle.art,
        objekte: daten.features.length,
        werte: Object.entries(verteilung).map(([k, n]) => `${k}:${n}`).join(" "),
      };
    }),
  );
}

async function modusDatei(key) {
  const geojson = JSON.parse(await readFile(`scripts/output/${key}.geojson`, "utf8"));
  const basis = JSON.parse(await readFile(`scripts/output/${key}.tempolimits.json`, "utf8"));
  const coords = geojson.geometry.coordinates;
  log("Lade amtliche Quellen...");
  const geladen = await alleQuellenLaden();
  const segmente = tempolimitsAbgleichen(indexFuer(geladen, coords), coords, basis);
  console.table([bericht(key, segmente)]);
  await writeFile(`scripts/output/${key}.tempolimits.json`, JSON.stringify(segmente));
}

async function modusLive(ids) {
  const liste = await (await fetch(`${API}/api/strecken`)).json();
  const routen = ids.length ? liste.routes.filter((r) => ids.includes(r.id)) : liste.routes;
  log(`${routen.length} Strecken von ${API}. Lade amtliche Quellen...`);
  const geladen = await alleQuellenLaden();

  const berichte = [];
  const sql = [];
  for (const r of routen) {
    const detail = await (await fetch(`${API}/api/strecken/${r.id}`)).json();
    const coords = detail.geometry?.coordinates;
    if (!coords?.length) continue;
    // Frühere amtliche Werte zurück auf die Kartendaten setzen wäre nicht
    // möglich (der OSM-Wert ist überschrieben) — daher dienen die
    // bestehenden Segmente als Basis und werden nur ergänzt.
    const basis = detail.tempolimits ?? [];
    const segmente = tempolimitsAbgleichen(indexFuer(geladen, coords), coords, basis);
    const b = bericht(r.name, segmente);
    berichte.push(b);
    if (Number(b.amtlichKm) > 0) {
      const json = JSON.stringify(segmente).replace(/'/g, "''");
      sql.push(`-- ${r.name}: ${b.amtlichKm} von ${b.km} km amtlich (${b.quellen})`);
      sql.push(`update public.routes set tempolimits = '${json}'::jsonb where id = '${r.id}';`);
    }
  }
  stderr.table(berichte);

  console.log("-- Amtliche Tempolimits für die freigegebenen Strecken.");
  console.log("-- Generiert von scripts/enrich-amtliche-tempolimits.mjs --live");
  console.log(`-- am ${new Date().toISOString().slice(0, 10)}. Quellen: scripts/amtliche-tempolimits/quellen.mjs.\n`);
  console.log(sql.join("\n"));
}

// --- Hochladen in die Tabelle amtliche_tempolimits (0102) ------------------

function wkt(f) {
  // Auf 10 cm gerundet und aufeinanderfolgende gleiche Punkte entfernt: in
  // Bern, Freiburg und Zürich fallen sonst kurze Achsstücke auf einen Punkt
  // zusammen, und PostGIS hält die Linie für ungültig.
  const runden = (punkte) =>
    punkte
      .map(([x, y]) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`)
      .filter((p, i, alle) => i === 0 || p !== alle[i - 1]);
  const kette = (punkte) => `(${punkte.join(",")})`;
  if (f.linien) {
    const linien = f.linien.map(runden).filter((l) => l.length >= 2);
    return linien.length ? `SRID=2056;MULTILINESTRING(${linien.map(kette).join(",")})` : null;
  }
  const polygone = f.flaechen
    .map((rings) => rings.map(runden).filter((r) => r.length >= 4))
    .filter((rings) => rings.length > 0);
  return polygone.length
    ? `SRID=2056;MULTIPOLYGON(${polygone.map((rings) => `(${rings.map(kette).join(",")})`).join(",")})`
    : null;
}

// Ersetzt je Quelle ihren gesamten Bestand. Nicht atomar über die ganze
// Quelle (PostgREST kennt keine Transaktion über mehrere Aufrufe): bricht
// ein Lauf ab, fehlt der Quelle ein Teil, bis er wiederholt wird — die
// Strecken-Vorschläge laufen in der Zeit mit Kartendaten weiter, mehr nicht.
async function modusHochladen(ids) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY setzen (Service Role).");
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });

  log("Lade amtliche Quellen...");
  const geladen = await alleQuellenLaden(ids);

  for (const { quelle, daten } of geladen) {
    const meta = {
      id: quelle.id,
      name: quelle.name,
      traeger: quelle.traeger,
      gebiet: quelle.gebiet,
      datensatz: quelle.datensatz,
      lizenz: quelle.lizenz,
      stand: quelle.stand ?? null,
      art: quelle.art,
      rang: quelle.rang,
      rand_m: quelle.randM ?? 0,
      amtlich: quelle.amtlich !== false,
      anzahl: 0,
      geladen_am: daten.geladen,
    };
    let r = await db.from("amtliche_tempolimit_quellen").upsert(meta);
    if (r.error) throw new Error(`${quelle.id}: ${r.error.message}`);
    r = await db.from("amtliche_tempolimits").delete().eq("quelle", quelle.id);
    if (r.error) throw new Error(`${quelle.id}: ${r.error.message}`);

    // Flächen (Genf) laufen beim Einfügen durch ST_IsValid/ST_MakeValid im
    // Trigger; grosse Stapel davon reissen das Statement-Timeout von Supabase.
    const MAX_ZEICHEN = quelle.art === "zone" ? 200_000 : 2_000_000;
    const MAX_ZEILEN = quelle.art === "zone" ? 50 : 1000;
    let stapel = [];
    let zeichen = 0;
    let anzahl = 0;
    const senden = async () => {
      if (!stapel.length) return;
      const res = await db.from("amtliche_tempolimits").insert(stapel);
      if (res.error) throw new Error(`${quelle.id}: ${res.error.message}`);
      anzahl += stapel.length;
      stapel = [];
      zeichen = 0;
    };
    for (const f of daten.features) {
      const geom = wkt(f);
      if (!geom) continue;
      stapel.push({ quelle: quelle.id, kmh: f.kmh, geom });
      zeichen += geom.length;
      if (zeichen > MAX_ZEICHEN || stapel.length >= MAX_ZEILEN) await senden();
    }
    await senden();

    r = await db.from("amtliche_tempolimit_quellen").update({ anzahl }).eq("id", quelle.id);
    if (r.error) throw new Error(`${quelle.id}: ${r.error.message}`);
    log(`  ${quelle.id.padEnd(24)} ${String(anzahl).padStart(6)} hochgeladen`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--frisch");
  if (args[0] === "--quellen") return modusQuellen();
  if (args[0] === "--hochladen") return modusHochladen(args.slice(1));
  if (args[0] === "--live") return modusLive(args.slice(1));
  if (args[0]) return modusDatei(args[0]);
  throw new Error("Nutzung: node scripts/enrich-amtliche-tempolimits.mjs --quellen | --hochladen [quelle ...] | --live [id ...] | <key>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
