import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Diese Datei testet ausnahmsweise SQL statt TypeScript, weil die
// Kontolöschung ausschliesslich in einer Datenbankfunktion lebt
// (anonymize_own_account, zuletzt 0058_kontoloeschung_werte_nullen.sql) und
// es hier keine Testdatenbank gibt. Sie fängt genau einen, real drohenden
// Fehler ab: profiles bekommt später eine neue Spalte, und niemand denkt
// daran, sie beim Löschen mitzuleeren — der neue Wert bliebe dann still am
// "gelöschten" Konto stehen. Das ist keine Prüfung des Laufzeitverhaltens.

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../supabase/migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function readMigration(file: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

// Alle heute existierenden Spalten von public.profiles, aus der
// Migrationshistorie rekonstruiert: die Spalten aus dem CREATE TABLE (0001)
// plus jedes spätere "add column", minus jedes "drop column".
function profileColumns(): Set<string> {
  const columns = new Set<string>();

  const createTable = /create table public\.profiles \(([\s\S]*?)\n\);/.exec(readMigration("0001_init.sql"));
  expect(createTable, "CREATE TABLE public.profiles in 0001_init.sql").not.toBeNull();
  for (const line of createTable![1].split("\n")) {
    const name = /^\s{2}(\w+)\s/.exec(line);
    if (name) columns.add(name[1]);
  }

  for (const file of migrationFiles()) {
    // Auf Anweisungen zerlegen, damit "add column" aus einer anderen Tabelle
    // (oder aus einem Funktionsrumpf) nicht mitgezählt wird. Zeilenkommentare
    // fallen vorher weg, sonst stünde der Kommentarblock vor einer Anweisung
    // noch mit in ihr drin und die Anweisung begänne nicht mit "alter table".
    const ohneKommentare = readMigration(file).replace(/^\s*--.*$/gm, "");
    for (const statement of ohneKommentare.split(";")) {
      if (!/^\s*alter table public\.profiles\b/.test(statement)) continue;
      for (const [, name] of statement.matchAll(/\badd column (\w+)\b/g)) columns.add(name);
      for (const [, name] of statement.matchAll(/\bdrop column (\w+)\b/g)) columns.delete(name);
    }
  }

  return columns;
}

// Die jüngste Fassung der Funktion gewinnt: 0042 hat sie eingeführt, 0045 und
// 0058 haben sie per CREATE OR REPLACE ersetzt.
function currentAnonymizeFunctionBody(): string {
  const file = migrationFiles()
    .filter((f) => readMigration(f).includes("function public.anonymize_own_account()"))
    .pop();
  expect(file, "Migration mit anonymize_own_account()").toBeDefined();

  const body = /create or replace function public\.anonymize_own_account\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(
    readMigration(file!),
  );
  expect(body, `Rumpf von anonymize_own_account() in ${file}`).not.toBeNull();
  return body![1];
}

// Spalten, die beim Löschen bewusst stehen bleiben — jede mit dem Grund,
// aus dem sie kein zu leerender Nutzerwert ist. Wer hier etwas ergänzt,
// trifft eine Datenschutzentscheidung; siehe 0058 für die ausführliche
// Begründung.
const ABSICHTLICH_ERHALTEN: Record<string, string> = {
  id: "Fremdschlüssel-Klammer der erhalten bleibenden Fahrten, kein Personenbezug",
  created_at: "reine Zeilen-Metadaten, not null",
  privatzone_radius_m: "not null; 0 hiesse 'Privatzone aus' und wäre das Gegenteil von neutral",
  kudos_gesehen_am: "not null, kein vom Nutzer eingegebener Wert",
};

describe("anonymize_own_account (Kontolöschung)", () => {
  const body = currentAnonymizeFunctionBody();

  it.each([...profileColumns()].filter((c) => !(c in ABSICHTLICH_ERHALTEN)))(
    "leert profiles.%s",
    (column) => {
      expect(body).toMatch(new RegExp(`\\b${column}\\s*=`));
    },
  );

  it("kennt jede absichtlich erhaltene Spalte noch", () => {
    const columns = profileColumns();
    for (const column of Object.keys(ABSICHTLICH_ERHALTEN)) {
      expect(columns, `${column} existiert nicht mehr — Ausnahme entfernen`).toContain(column);
    }
  });

  it("setzt den Namen auf null statt auf einen Platzhalter", () => {
    expect(body).toMatch(/display_name\s*=\s*null/);
    expect(body).not.toContain("Gelöschtes Konto");
  });

  it("hält den Löschzeitpunkt fest, ohne ihn bei erneutem Aufruf zu überschreiben", () => {
    expect(body).toMatch(/geloescht_am\s*=\s*coalesce\(geloescht_am, now\(\)\)/);
  });

  it("bindet sich an die eigene Sitzung statt an einen Parameter", () => {
    expect(body).toContain("auth.uid() is null");
    expect(body).not.toMatch(/\b(?:id|user_id)\s*=(?!\s*auth\.uid\(\))/);
  });
});
