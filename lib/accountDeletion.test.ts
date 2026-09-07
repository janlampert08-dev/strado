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
      // "if not exists" / "if exists" gehören zur Syntax, nicht zum Namen —
      // ohne das optionale Stück landete "if" als Spalte im Set.
      for (const [, name] of statement.matchAll(/\badd column (?:if not exists )?(\w+)\b/g)) {
        columns.add(name);
      }
      for (const [, name] of statement.matchAll(/\bdrop column (?:if exists )?(\w+)\b/g)) {
        columns.delete(name);
      }
    }
  }

  return columns;
}

// Die jüngste Fassung gewinnt: 0042 hat die Löschung eingeführt, 0045 und
// 0058 haben sie ersetzt, 0076 hat sie in die parametrisierte
// anonymize_account(p_user_id) verschoben. Seitdem ist DIESE Funktion die
// Implementierung — anonymize_own_account() ist nur noch eine Hülle darum
// und hätte keinen Rumpf mehr, den zu prüfen sich lohnt.
function currentAnonymizeFunctionBody(): string {
  const file = migrationFiles()
    .filter((f) => readMigration(f).includes("function public.anonymize_account(p_user_id uuid)"))
    .pop();
  expect(file, "Migration mit anonymize_account(p_user_id uuid)").toBeDefined();

  const body =
    /create or replace function public\.anonymize_account\(p_user_id uuid\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(
      readMigration(file!),
    );
  expect(body, `Rumpf von anonymize_account() in ${file}`).not.toBeNull();
  return body![1];
}

// Die Hülle separat: sie darf keine eigene Logik bekommen, sondern muss an
// die parametrisierte Fassung delegieren. Zwei Implementierungen derselben
// Löschung wären genau die Sorte Duplikat, die auseinanderläuft.
function ownAccountWrapperBody(): string {
  const file = migrationFiles()
    .filter((f) => readMigration(f).includes("function public.anonymize_own_account()"))
    .pop();
  expect(file, "Migration mit anonymize_own_account()").toBeDefined();

  const body =
    /create or replace function public\.anonymize_own_account\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(
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

describe("anonymize_account (Kontolöschung)", () => {
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

  // Seit 0076 ist die Bindung an die Identität NICHT mehr Sache dieser
  // Funktion: Sie bekommt die ID als Parameter und läuft nur für
  // service_role. Festgestellt wird die Identität eine Ebene höher, in
  // deleteAccount() (Passwort-Neueingabe) bzw. in der Hülle
  // anonymize_own_account() (auth.uid()).
  //
  // Was hier zählt: auth.uid() darf im Rumpf nicht mehr vorkommen. Unter
  // einem service_role-Aufruf ist es NULL — jedes darauf gefilterte
  // Statement träfe keine Zeile, die Funktion liefe fehlerfrei durch und
  // hätte nichts getan. Das ist der Fehler, der beim Umbau am ehesten
  // passiert, und er wäre lautlos.
  it("filtert ausschliesslich über den Parameter, nie über auth.uid()", () => {
    expect(body).not.toContain("auth.uid()");
    expect(body).toMatch(/where id = p_user_id/);
    expect(body).toMatch(/where user_id = p_user_id/);
  });

  it("löscht die Abo-Zeile, damit premium_abgleich sie nicht wiederherstellt", () => {
    expect(body).toMatch(/delete from public\.subscriptions where user_id = p_user_id/);
  });
});

describe("anonymize_own_account (Hülle)", () => {
  const wrapper = ownAccountWrapperBody();

  it("delegiert an die parametrisierte Fassung, statt eigene Logik zu haben", () => {
    expect(wrapper).toMatch(/perform public\.anonymize_account\(auth\.uid\(\)\)/);
    // Keine zweite Implementierung: kein eigenes UPDATE/DELETE im Rumpf.
    expect(wrapper).not.toMatch(/\bupdate\s+public\./);
    expect(wrapper).not.toMatch(/\bdelete\s+from\s+public\./);
  });

  it("prüft weiterhin, dass überhaupt eine Sitzung existiert", () => {
    expect(wrapper).toContain("auth.uid() is null");
  });
});
