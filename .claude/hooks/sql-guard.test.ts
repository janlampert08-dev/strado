import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HOOK = path.resolve(import.meta.dirname, "sql-guard.sh");

/**
 * Ruft den PreToolUse-Hook mit dem Payload auf, den Claude Code schickt, und
 * meldet, ob er einen Permission-Prompt erzwingt.
 */
function fordertBestaetigung(command: string): boolean {
  const stdout = execFileSync("bash", [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
  });
  if (stdout.trim() === "") return false;
  const decision = JSON.parse(stdout).hookSpecificOutput?.permissionDecision;
  expect(decision).toBe("ask");
  return true;
}

describe("sql-guard: Kommandos, die die Datenbank erreichen", () => {
  it.each([
    "psql $DATABASE_URL",
    'echo "DROP TABLE routen;" | psql "$DATABASE_URL"',
    "pg_dump --schema-only",
    "pg_restore dump.sql",
    "supabase db push",
    "npx supabase db push --linked",
    "supabase db reset",
    "sudo psql",
  ])("fordert Bestaetigung: %s", (command) => {
    expect(fordertBestaetigung(command)).toBe(true);
  });
});

describe("sql-guard: supabase migration", () => {
  it.each([
    "supabase migration up",
    "supabase migration repair --status applied 0062",
    "supabase migration squash",
    "supabase migration fetch",
  ])("fordert Bestaetigung fuer %s", (command) => {
    expect(fordertBestaetigung(command)).toBe(true);
  });

  it.each([
    "supabase migration new premium_abo",
    "supabase migration list",
    "supabase migration list --linked",
    "npx supabase migration new premium_abo",
  ])("laesst %s ohne Bestaetigung durch", (command) => {
    expect(fordertBestaetigung(command)).toBe(false);
  });

  // Ein unbekanntes Subkommando darf nicht durchrutschen: der Hook arbeitet
  // mit einer Ausnahmeliste (new/list), nicht mit einer Positivliste der
  // gefaehrlichen Subkommandos.
  it("fordert Bestaetigung fuer unbekannte Subkommandos", () => {
    expect(fordertBestaetigung("supabase migration apply-all")).toBe(true);
  });

  it("fordert Bestaetigung, wenn ein ausgenommenes Kommando verkettet wird", () => {
    expect(
      fordertBestaetigung(
        "supabase migration new foo && supabase migration repair 0001",
      ),
    ).toBe(true);
  });
});

describe("sql-guard: unbeteiligte Kommandos", () => {
  it.each([
    'git commit -m "supabase db push in README dokumentiert"',
    "supabase functions list",
    "npm run test",
    "grep -r psql docs/",
  ])("laesst %s ohne Bestaetigung durch", (command) => {
    expect(fordertBestaetigung(command)).toBe(false);
  });
});
