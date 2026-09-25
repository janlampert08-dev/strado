import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 0151 lässt Streckenabschnitte die Sichtbarkeit ihrer Fahrt erben. Der
// Deckungsgrad-Trigger muss danach feuern, sonst könnte ein Abschnitt mit zu
// wenig Deckung öffentlich werden: PostgreSQL feuert BEFORE-Trigger
// derselben Tabelle alphabetisch. Wer einen der beiden umbenennt, bricht die
// Reihenfolge lautlos — dieser Test nicht.
const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/0151_abschnitte_folgen_fahrt.sql"),
  "utf8",
);

describe("0151 Abschnitte folgen der Fahrt", () => {
  it("erbt vor der Deckungsgrad-Prüfung", () => {
    const name = /create trigger (\S+)\s+before insert on public\.route_completions/.exec(migration)?.[1];
    expect(name).toBeDefined();
    expect(name! < "route_completions_recompute_coverage").toBe(true);
  });

  it("zieht nur bei Fahrten nach, nicht bei Abschnitten (keine Rekursion)", () => {
    expect(migration).toMatch(/when \(new\.parent_completion_id is null and old\.ist_oeffentlich is distinct from new\.ist_oeffentlich\)/);
  });

  it("macht Abschnitte nur auf öffentlichen, freigegebenen Strecken öffentlich", () => {
    const vorkommen = migration.match(/r\.status_ok and not r\.ist_privat/g) ?? [];
    expect(vorkommen.length).toBeGreaterThanOrEqual(3);
  });
});
