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
//
// Eingetragen sind die vollständigen Dateinamen, nicht nur die Präfixe.
// Ein Präfix allein wäre ein Freibrief: unter 0034 liesse sich eine dritte
// Datei ablegen oder eine der beiden gegen eine andere austauschen, und
// dieses Skript winkte es als "bekannt" durch. Die Namen sind der
// Ist-Zustand, gegen den die README ihre Angewendet/Offen-Zuordnung führt —
// ändert sich einer, stimmt diese Zuordnung nicht mehr.
const ALTBESTAND = new Map([
  ["0034", ["0034_profiles_column_grant_hardening.sql", "0034_public_fahrten_foto.sql"]],
  ["0041", ["0041_rating_cooldown_covers_edits.sql", "0041_route_proposal_cooldown.sql"]],
  ["0053", ["0053_gefolgt_von_feature.sql", "0053_kudos_gesehen.sql"]],
  ["0054", ["0054_leaderboard_user_totals.sql", "0054_sichtbarkeit_standardmaessig_aktiv.sql"]],
  [
    "0059",
    ["0059_fahrtstatistiken_serverseitig_erzwingen.sql", "0059_premium_abo_zustand.sql"],
  ],
  [
    "0060",
    [
      "0060_premium_funktionen_execute_entziehen.sql",
      "0060_private_strecken_aus_oeffentlichen_views.sql",
    ],
  ],
]);

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

// Eine Kollision zählt nur dann als Altbestand, wenn die Dateien exakt die
// eingetragenen sind — sonst ist sie neu, egal ob der Präfix bekannt ist.
const gleicheDateien = (a, b) =>
  a.length === b.length && [...a].sort().every((datei, i) => datei === [...b].sort()[i]);

const neueKollisionen = [];
const altbestandGefunden = [];
for (const [praefix, dateien] of nachPraefix) {
  if (dateien.length < 2) continue;
  const erwartet = ALTBESTAND.get(praefix);
  (erwartet && gleicheDateien(dateien, erwartet) ? altbestandGefunden : neueKollisionen).push([
    praefix,
    dateien,
  ]);
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
const verwaist = [...ALTBESTAND.keys()].filter((p) => (nachPraefix.get(p) ?? []).length < 2);
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
      `Präfix kann pro Umgebung nur eine registriert werden. Bitte umbenennen.\n` +
      `Steht der Präfix als Altbestand drin, hat sich dort die Dateiliste geändert:\n` +
      `dann gehört auch die Zuordnung in supabase/migrations/README.md nachgezogen.`,
  );
  process.exit(1);
}

console.log(`\nKeine neuen Kollisionen. ${nachPraefix.size} Präfixe geprüft.`);
