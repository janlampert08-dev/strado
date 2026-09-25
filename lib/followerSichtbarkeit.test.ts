import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Follower-Fahrten (0145) stehen in denselben Views wie öffentliche Fahrten.
// Die Views laufen mit den Rechten ihres Owners, die WHERE-Bedingung ist die
// einzige Sichtbarkeitsprüfung. Wer eine davon später neu anlegt (0150 hat
// public_fahrten schon einmal umgeschrieben) und fuer_follower ohne die
// Prüfung übernimmt, gäbe Follower-Fahrten für alle frei — dieser Test
// schlägt dann an, statt dass es erst in der Produktion auffällt.
const verzeichnis = join(process.cwd(), "supabase/migrations");
const dateien = readdirSync(verzeichnis)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

// Die jüngste Definition einer View: die letzte Datei, die sie neu anlegt,
// und darin der Text bis zum nächsten Semikolon am Zeilenende.
function juengsteDefinition(view: string): { datei: string; sql: string } {
  const muster = new RegExp(`create or replace view public\\.${view} as([\\s\\S]*?);\\s*$`, "im");
  for (const datei of [...dateien].reverse()) {
    const treffer = muster.exec(readFileSync(join(verzeichnis, datei), "utf8"));
    if (treffer) return { datei, sql: treffer[1] };
  }
  throw new Error(`Keine Definition von ${view} gefunden`);
}

// Nur der WHERE-Teil zählt: public_fahrten führt fuer_follower auch als
// Spalte in der SELECT-Liste, und die gibt nichts frei.
function whereTeil(sql: string): string {
  const i = sql.search(/\bwhere\b/i);
  return i === -1 ? "" : sql.slice(i);
}

const VIEWS = ["public_fahrten", "public_fahrt_tracks", "public_completion_photos", "kudos_summary"];

describe("Follower-Fahrten in den öffentlichen Views (0145)", () => {
  it.each(VIEWS)("%s gibt fuer_follower nur mit Prüfung frei", (view) => {
    const { datei, sql } = juengsteDefinition(view);
    const where = whereTeil(sql);
    if (!/fuer_follower/.test(where)) return; // ohne Follower-Zweig: nur öffentlich, fail closed
    const ungeprueft = where
      .replace(/rc\.fuer_follower\s+and\s+(public\.)?fahrt_fuer_follower_sichtbar\(rc\.user_id\)/g, "")
      .match(/fuer_follower/g);
    expect(ungeprueft, `${view} in ${datei}: fuer_follower ohne fahrt_fuer_follower_sichtbar`).toBeNull();
  });

  it("Ranglisten kennen keine Follower-Fahrten", () => {
    for (const view of ["route_leaderboard", "leaderboard_completions"]) {
      let gefunden = false;
      for (const datei of [...dateien].reverse()) {
        const sql = readFileSync(join(verzeichnis, datei), "utf8");
        const m = new RegExp(`create or replace view public\\.${view} as([\\s\\S]*?);\\s*$`, "im").exec(sql);
        if (m) {
          expect(m[1], `${view} in ${datei}`).not.toMatch(/fuer_follower/);
          gefunden = true;
          break;
        }
      }
      expect(gefunden, `${view} nicht gefunden`).toBe(true);
    }
  });
});
