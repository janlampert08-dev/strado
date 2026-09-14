import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

// Statischer Wächter für eine Fehlerklasse, die die übrige Suite nicht sehen
// kann.
//
// DIE REGEL: Aus einer "use client"-Datei darf eine Server Component nur
// KOMPONENTEN importieren. Jeder andere Export — eine Konstante, eine reine
// Funktion — ist auf der Serverseite kein Wert mehr, sondern ein
// Client-Verweis: ein Stub, der beim Aufruf wirft.
//
// WARUM ALS DATEISCAN UND NICHT ALS LAUFZEITTEST: Vitest läuft hier mit
// environment "node" und kennt die React-Server-Grenze nicht. Ein Import von
// chipClassName liefert im Test die echte Funktion — der Fehler tritt
// ausschliesslich beim Rendern einer echten Anfrage auf. Auch `next build`
// sieht ihn nicht. Deshalb wird hier der Quelltext geprüft, nicht Verhalten.
//
// WAS ES GEKOSTET HAT: In app/leaderboards/page.tsx standen beide Varianten
// gleichzeitig. CHIP_ALLE als Objektschlüssel wurde per String() zum
// Quelltext des Stubs, wodurch der "Alle"-Chip zu einem Knopf ohne Wirkung
// wurde; und chipClassName() wäre beim ersten Nutzer mit eindeutiger
// Motorklasse geflogen und hätte die Seite mitgenommen. Beides stumm.
//
// GRENZEN, ehrlich benannt: Das ist eine Textprüfung, keine Typprüfung. Sie
// versteht `export const`, `export function`, `export class` und
// `export { … }` und erkennt Typ-Importe. Wer einen Export dynamisch
// erzeugt oder um zwei Ecken re-exportiert, läuft daran vorbei.
//
// KOMPONENTEN BLEIBEN BEWUSST UNGEPRÜFT, in beiden Importformen: Genau
// dafür ist eine "use client"-Datei da — eine Server Component darf die
// Komponente importieren und rendern. Das gilt für den Default-Import und
// genauso für den benannten, denn ob eine Komponente per default oder per
// Namen exportiert wird, ist eine Stilfrage ohne Bedeutung für die Grenze.
// components/ui/Input.tsx exportiert `Input` und `Textarea` benannt,
// components/ui/Dialog.tsx `Dialog` und `ConfirmDialog` — sie aus einer
// Server Component zu importieren ist richtig und muss grün bleiben.
//
// Unterschieden wird an der Schreibweise des Namens, siehe
// sichtWieKomponenteAus(). Das ist eine Konvention, keine Typprüfung: eine
// PascalCase-Konstante in einer "use client"-Datei käme damit durch. Der
// Preis ist bewusst, denn die Alternative war teurer — eine Prüfung, die
// bei korrektem Code rot wird, wird abgeschaltet, und dann fängt sie auch
// den Fall nicht mehr, für den es sie gibt. Die beiden echten Verstösse,
// die diesen Wächter ausgelöst haben, bleiben gefangen: chipClassName
// (camelCase) und CHIP_ALLE (Grossbuchstaben mit Unterstrich).

const WURZEL = resolve(__dirname, "..");
const ORDNER = ["app", "components", "lib", "types"];

function dateien(pfad: string): string[] {
  if (!existsSync(pfad)) return [];
  return readdirSync(pfad).flatMap((eintrag) => {
    const voll = join(pfad, eintrag);
    if (statSync(voll).isDirectory()) return dateien(voll);
    return /\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag) ? [voll] : [];
  });
}

function istClientDatei(inhalt: string): boolean {
  // Die Direktive muss ganz oben stehen; Kommentare davor sind erlaubt.
  const kopf = inhalt.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "");
  return /^["']use client["']/.test(kopf);
}

/** Exporte, die zur Laufzeit einen Wert tragen — Typen zählen nicht. */
function laufzeitExporte(inhalt: string): Set<string> {
  const namen = new Set<string>();
  for (const m of inhalt.matchAll(
    /^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm,
  )) {
    namen.add(m[1]);
  }
  for (const m of inhalt.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const teil of m[1].split(",")) {
      const roh = teil.trim();
      if (!roh || /^type\s/.test(roh)) continue;
      namen.add((roh.split(/\s+as\s+/).pop() ?? roh).trim());
    }
  }
  return namen;
}

/**
 * Sieht der Name nach einer React-Komponente aus?
 *
 * PascalCase, also: erster Buchstabe gross UND irgendwo ein Kleinbuchstabe
 * UND kein Unterstrich. Die zweite und dritte Bedingung sind das, was
 * Komponenten von Konstanten trennt — `Input` und `ConfirmDialog` erfüllen
 * alle drei, `CHIP_ALLE` und `MONATE` scheitern daran, dass sie keinen
 * Kleinbuchstaben haben, und `CHIP_ALLE` zusätzlich am Unterstrich.
 * `chipClassName` scheitert schon am ersten Buchstaben.
 *
 * Dieselbe Konvention, nach der JSX selbst entscheidet: <input /> ist ein
 * HTML-Element, <Input /> ein Verweis auf eine Variable. Wer eine
 * Komponente klein schreibt, kann sie ohnehin nicht rendern.
 */
function sichtWieKomponenteAus(name: string): boolean {
  return /^[A-Z]/.test(name) && /[a-z]/.test(name) && !name.includes("_");
}

function aufloesen(spezifizierer: string, vonDatei: string): string | null {
  const basis = spezifizierer.startsWith("@/")
    ? join(WURZEL, spezifizierer.slice(2))
    : spezifizierer.startsWith(".")
      ? resolve(dirname(vonDatei), spezifizierer)
      : null;
  if (!basis) return null;
  for (const kandidat of [
    `${basis}.ts`,
    `${basis}.tsx`,
    join(basis, "index.ts"),
    join(basis, "index.tsx"),
  ]) {
    if (existsSync(kandidat) && statSync(kandidat).isFile()) return kandidat;
  }
  return null;
}

describe("sichtWieKomponenteAus", () => {
  // Diese Funktion entscheidet, was der Wächter durchlässt. Sie steht
  // deshalb einzeln unter Test und nicht nur implizit im Dateiscan: eine
  // zu weite Fassung macht den Wächter wirkungslos, eine zu enge macht ihn
  // rot bei korrektem Code.
  it("erkennt Komponentennamen", () => {
    for (const name of ["Input", "Textarea", "ConfirmDialog", "Dialog", "Card"]) {
      expect(sichtWieKomponenteAus(name)).toBe(true);
    }
  });

  it("erkennt die beiden Schreibweisen, die den Wächter ausgelöst haben", () => {
    expect(sichtWieKomponenteAus("chipClassName")).toBe(false);
    expect(sichtWieKomponenteAus("CHIP_ALLE")).toBe(false);
  });

  it("lässt Konstanten in Grossbuchstaben nicht durch, auch ohne Unterstrich", () => {
    expect(sichtWieKomponenteAus("MONATE")).toBe(false);
    expect(sichtWieKomponenteAus("SLOGAN")).toBe(false);
  });
});

describe("React-Server-Grenze", () => {
  // Belegt, dass die Ausnahme oben einen echten Fall bedient und nicht nur
  // eine Annahme ist: components/ui/Input.tsx IST eine "use client"-Datei
  // mit benanntem Komponenten-Export. Ohne die Ausnahme meldete der
  // Wächter jede Server Component, die von dort importiert — also
  // korrekten Code. Schlägt dieser Test fehl, weil die Datei umgebaut
  // wurde, gehört die Ausnahme neu begründet statt stillschweigend
  // weitergeschleppt.
  it("hat mindestens eine use-client-Datei mit benanntem Komponenten-Export", () => {
    const datei = join(WURZEL, "components/ui/Input.tsx");
    const inhalt = readFileSync(datei, "utf8");
    expect(istClientDatei(inhalt)).toBe(true);
    const werte = laufzeitExporte(inhalt);
    expect(werte.has("Input")).toBe(true);
    expect(sichtWieKomponenteAus("Input")).toBe(true);
    // Die Nicht-Komponente in derselben Datei bleibt geprüft.
    expect(werte.has("fieldClassName")).toBe(true);
    expect(sichtWieKomponenteAus("fieldClassName")).toBe(false);
  });

  it("importiert aus keiner Server-Datei einen Wert-Export einer use-client-Datei", () => {
    const alle = ORDNER.flatMap((o) => dateien(join(WURZEL, o)));
    const inhalte = new Map(alle.map((d) => [d, readFileSync(d, "utf8")]));

    const verstoesse: string[] = [];

    for (const [datei, inhalt] of inhalte) {
      if (istClientDatei(inhalt)) continue;

      // Der optionale erste Teil deckt `import Default, { X } from …` ab —
      // genau die Form, in der der Fehler hier tatsächlich auftrat. Eine
      // frühere Fassung dieser Regex verlangte die Klammern direkt hinter
      // `import` und ging deshalb an ihm vorbei; aufgefallen ist das erst,
      // als der Verstoss zur Gegenprobe wieder eingebaut wurde.
      for (const m of inhalt.matchAll(
        /import\s+(type\s+)?(?:[A-Za-z0-9_$]+\s*,\s*)?(\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
      )) {
        if (m[1]) continue; // import type { … } — reine Typen, erlaubt
        const ziel = aufloesen(m[3], datei);
        if (!ziel) continue;
        const zielInhalt = inhalte.get(ziel);
        if (!zielInhalt || !istClientDatei(zielInhalt)) continue;

        const werte = laufzeitExporte(zielInhalt);
        for (const teil of m[2].slice(1, -1).split(",")) {
          const roh = teil.trim();
          if (!roh || /^type\s/.test(roh)) continue;
          const name = roh.split(/\s+as\s+/)[0].trim();
          // Der Name, der in der Zieldatei steht, entscheidet — nicht der
          // Alias hier. `import { Input as Feld }` importiert immer noch
          // die Komponente Input.
          if (sichtWieKomponenteAus(name)) continue;
          if (werte.has(name)) {
            verstoesse.push(
              `${datei.slice(WURZEL.length + 1)} importiert "${name}" ` +
                `aus ${ziel.slice(WURZEL.length + 1)} ("use client")`,
            );
          }
        }
      }
    }

    expect(verstoesse).toEqual([]);
  });

  it("importiert aus keiner Server-Datei eine use-client-Datei als Namensraum", () => {
    // `import * as Chips from "…"` bindet KEINE Namen einzeln und läuft
    // deshalb an der Prüfung oben vorbei — über den Namensraum ist aber
    // jeder Export erreichbar, `Chips.chipClassName(false)` eingeschlossen.
    // Welche Eigenschaft am Ende gelesen wird, sieht ein Textscan nicht
    // zuverlässig; deshalb ist hier die ganze Importform verboten statt
    // einzelner Zugriffe. Aufgefallen ist die Lücke in der CodeRabbit-Review
    // zu diesem PR, nachdem ich ausdrücklich nach übersehenen Formen gefragt
    // hatte — die erste Fassung des Wächters war grün und trotzdem
    // unvollständig.
    const alle = ORDNER.flatMap((o) => dateien(join(WURZEL, o)));
    const inhalte = new Map(alle.map((d) => [d, readFileSync(d, "utf8")]));

    const verstoesse: string[] = [];

    for (const [datei, inhalt] of inhalte) {
      if (istClientDatei(inhalt)) continue;

      for (const m of inhalt.matchAll(
        /import\s+(?:[A-Za-z0-9_$]+\s*,\s*)?\*\s+as\s+([A-Za-z0-9_$]+)\s+from\s+["']([^"']+)["']/g,
      )) {
        const ziel = aufloesen(m[2], datei);
        if (!ziel) continue;
        const zielInhalt = inhalte.get(ziel);
        if (!zielInhalt || !istClientDatei(zielInhalt)) continue;

        verstoesse.push(
          `${datei.slice(WURZEL.length + 1)} importiert ` +
            `${ziel.slice(WURZEL.length + 1)} ("use client") als Namensraum "${m[1]}"`,
        );
      }
    }

    expect(verstoesse).toEqual([]);
  });
});
