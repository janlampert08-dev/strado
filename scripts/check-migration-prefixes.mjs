#!/usr/bin/env node
// Bricht ab, wenn zwei Migrationsdateien denselben Zahlenpräfix tragen.
//
// Hintergrund: supabase_migrations.schema_migrations.version ist Primary
// Key. Ein Präfix kann pro Umgebung also höchstens einmal eingetragen
// werden — bei einer Kollision bleibt eine der beiden Dateien
// unregistriert, und welche das ist, entscheidet nicht das Verzeichnis.
//
// Dass das kein theoretisches Problem ist, steht in
// supabase/migrations/README.md: die Kollisionen 0059 und 0060 haben
// jeweils die Sicherheitsmigration auf der unangewendeten Seite liegen
// lassen (Audit-Befunde A1 und A3).
//
// Die bestehenden sechs Paare sind unten als Altbestand eingetragen.
// Diese Liste darf nur kürzer werden. Wer sie verlängert, hat das
// Problem reproduziert, das dieses Skript verhindern soll.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");

// Bekannte, historische Kollisionen. Dokumentiert in
// supabase/migrations/README.md — dort steht auch, welche Hälfte jeweils
// eingespielt ist.
const ALTBESTAND = new Set(["0034", "0041", "0053", "0054", "0059", "0060"]);

const nachPraefix = new Map();
for (const datei of readdirSync(migrationsDir)) {
  if (!datei.endsWith(".sql")) continue;
  const treffer = /^(\d+)_/.exec(datei);
  if (!treffer) {
    console.error(`Migration ohne Zahlenpräfix: ${datei}`);
    process.exit(1);
  }
  const praefix = treffer[1];
  if (!nachPraefix.has(praefix)) nachPraefix.set(praefix, []);
  nachPraefix.get(praefix).push(datei);
}

const neueKollisionen = [];
const altbestandGefunden = [];
for (const [praefix, dateien] of nachPraefix) {
  if (dateien.length < 2) continue;
  (ALTBESTAND.has(praefix) ? altbestandGefunden : neueKollisionen).push([praefix, dateien]);
}

if (altbestandGefunden.length > 0) {
  console.log(`Bekannte Kollisionen (Altbestand, ${altbestandGefunden.length}):`);
  for (const [praefix, dateien] of altbestandGefunden.sort()) {
    console.log(`  ${praefix}: ${dateien.sort().join(", ")}`);
  }
}

// Ein Altbestandseintrag, der nicht mehr kollidiert, ist aufgeräumt
// worden — dann gehört er aus der Liste raus, damit sie nicht stillschweigend
// wieder Platz für eine neue Kollision schafft.
const verwaist = [...ALTBESTAND].filter((p) => (nachPraefix.get(p) ?? []).length < 2);
if (verwaist.length > 0) {
  console.error(
    `\nDiese Präfixe stehen als Altbestand in ${"scripts/check-migration-prefixes.mjs"}, ` +
      `kollidieren aber nicht mehr: ${verwaist.sort().join(", ")}\n` +
      `Bitte aus ALTBESTAND entfernen.`,
  );
  process.exit(1);
}

if (neueKollisionen.length > 0) {
  console.error(`\nNeue doppelte Migrationspräfixe (${neueKollisionen.length}):`);
  for (const [praefix, dateien] of neueKollisionen.sort()) {
    console.error(`  ${praefix}: ${dateien.sort().join(", ")}`);
  }
  console.error(
    `\nschema_migrations.version ist Primary Key — von zwei Dateien mit demselben\n` +
      `Präfix kann pro Umgebung nur eine registriert werden. Bitte umbenennen.`,
  );
  process.exit(1);
}

console.log(`\nKeine neuen Kollisionen. ${nachPraefix.size} Präfixe geprüft.`);
