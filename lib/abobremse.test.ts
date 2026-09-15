import { describe, expect, it } from "vitest";
import {
  BESTAETIGEN_SCHLIMMSTER_EHRLICHER_FALL,
  CHECKOUT_ANLEGEN_LIMIT,
  CHECKOUT_BESTAETIGEN_LIMIT,
  CHECKOUT_BESTAETIGEN_FENSTER_MS,
  EINZELVERSUCH,
  WARTEZEITEN_MS,
} from "@/lib/abobremse";
import { isRateLimitedByKey } from "@/lib/rateLimit";

describe("Abo-Bremsen", () => {
  // Der teuerste Fehler, den lib/actions/billing.ts machen kann, ist "bezahlt,
  // aber kein Premium". Genau dorthin führte eine zu eng gesetzte Bremse auf
  // dem Bestätigungspfad. Dieser Test hält den Abstand fest.
  it("lässt dem Bestätigen ein Vielfaches des schlimmsten ehrlichen Falls", () => {
    expect(CHECKOUT_BESTAETIGEN_LIMIT).toBeGreaterThanOrEqual(
      BESTAETIGEN_SCHLIMMSTER_EHRLICHER_FALL * 5,
    );
  });

  it("bremst das Anlegen enger als das Bestätigen", () => {
    // Beim Anlegen ist noch kein Geld geflossen; ein Fehlalarm kostet einen
    // Klick. Die Ungleichheit der beiden Zahlen ist Absicht und keine
    // Nachlässigkeit — kehrt sie sich um, ist etwas durcheinandergeraten.
    expect(CHECKOUT_ANLEGEN_LIMIT).toBeLessThan(CHECKOUT_BESTAETIGEN_LIMIT);
  });

  // Gegenprobe am echten Limiter statt nur an den Zahlen: die volle
  // automatische Leiter plus ein paar Klicks muss durchkommen.
  it("lässt eine echte Bestätigungsrunde vollständig durch", () => {
    const key = `test:bestaetigen:${crypto.randomUUID()}`;
    const versuche = WARTEZEITEN_MS.length + EINZELVERSUCH.length * 3;
    for (let i = 0; i < versuche; i++) {
      expect(
        isRateLimitedByKey(key, CHECKOUT_BESTAETIGEN_LIMIT, CHECKOUT_BESTAETIGEN_FENSTER_MS),
      ).toBe(false);
    }
  });

  it("stoppt eine Schleife weit vor dem Ende", () => {
    const key = `test:schleife:${crypto.randomUUID()}`;
    let gebremstNach: number | null = null;
    for (let i = 0; i < 5_000; i++) {
      if (isRateLimitedByKey(key, CHECKOUT_BESTAETIGEN_LIMIT, CHECKOUT_BESTAETIGEN_FENSTER_MS)) {
        gebremstNach = i;
        break;
      }
    }
    expect(gebremstNach).toBe(CHECKOUT_BESTAETIGEN_LIMIT);
  });
});
