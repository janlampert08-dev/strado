import { describe, it, expect } from "vitest";
import {
  betragText,
  jahresVorteilProzent,
  monatsAequivalentRappen,
  passZeitraum,
  planName,
  saisonpassVerlaengerbar,
} from "./premiumAngebot";
import type { PlanAngebot } from "./premiumLimits";

function plan(betragRappen: number, teil: Partial<PlanAngebot> = {}): PlanAngebot {
  return {
    plan: "jahr",
    betragRappen,
    waehrung: "chf",
    ...teil,
  };
}

describe("betragText", () => {
  it("schreibt Rappen als Frankenbetrag mit zwei Nachkommastellen", () => {
    //   statt eines gewöhnlichen Leerzeichens: Intl trennt Währung und
    // Betrag mit einem geschützten Leerzeichen, damit die Zeile nicht
    // zwischen "CHF" und der Zahl umbricht.
    expect(betragText(4900, "chf")).toBe("CHF 49.00");
    expect(betragText(490, "chf")).toBe("CHF 4.90");
  });

  it("nimmt die Währung so, wie Stripe sie führt (klein geschrieben)", () => {
    expect(betragText(1000, "eur")).toBe(betragText(1000, "EUR"));
  });

  it("teilt nicht blind durch 100, sondern nach den Stellen der Währung", () => {
    // Stripe führt Beträge in der kleinsten Einheit, und die ist nicht
    // überall ein Hundertstel: 4900 JPY sind 4900 Yen, nicht 49. Eine fest
    // verdrahtete 100 wäre hier ein um den Faktor 100 falsch ausgezeichneter
    // Preis. Verglichen wird gegen dieselbe Formatierung mit dem fertigen
    // Betrag, damit der Test nicht an Trennzeichen oder Währungssymbol
    // einer Locale-Version hängt.
    const jpy = new Intl.NumberFormat("de-CH", { style: "currency", currency: "JPY" });
    expect(betragText(4900, "jpy")).toBe(jpy.format(4900));
    // Drei Nachkommastellen, die andere Richtung: 4900 Fils sind BHD 4.900.
    const bhd = new Intl.NumberFormat("de-CH", { style: "currency", currency: "BHD" });
    expect(betragText(4900, "bhd")).toBe(bhd.format(4.9));
  });
});

describe("monatsAequivalentRappen", () => {
  it("rechnet den Jahrespreis auf einen Monat herunter", () => {
    expect(monatsAequivalentRappen(4900)).toBe(408);
    expect(monatsAequivalentRappen(3900)).toBe(325);
  });

  it("rundet auf ganze Rappen statt Bruchteile anzuzeigen", () => {
    expect(monatsAequivalentRappen(100)).toBe(8);
  });
});

describe("jahresVorteilProzent", () => {
  it("beziffert den Vorteil gegenüber zwölf Monatszahlungen", () => {
    // CHF 4.90 × 12 = CHF 58.80 gegenüber CHF 49.00 — die zwei Gratismonate
    // aus docs/premium-plan.md, Abschnitt 6.
    expect(jahresVorteilProzent(plan(490, { plan: "monat" }), plan(4900))).toBe(17);
  });

  it("behauptet keinen Vorteil, wenn der Jahresplan nicht günstiger ist", () => {
    expect(jahresVorteilProzent(plan(490, { plan: "monat" }), plan(5880))).toBeNull();
    expect(jahresVorteilProzent(plan(490, { plan: "monat" }), plan(6000))).toBeNull();
  });

  it("vergleicht keine unterschiedlichen Währungen", () => {
    // Ein Prozentsatz aus CHF gegen EUR wäre eine erfundene Zahl auf einer
    // Kaufseite — lieber kein Abzeichen als ein falsches.
    expect(
      jahresVorteilProzent(plan(490, { plan: "monat", waehrung: "eur" }), plan(4900)),
    ).toBeNull();
  });

  it("bleibt still, solange ein Plan fehlt", () => {
    expect(jahresVorteilProzent(undefined, plan(4900))).toBeNull();
    expect(jahresVorteilProzent(plan(490, { plan: "monat" }), undefined)).toBeNull();
  });
});

// Die Zuordnung stand bis 2026-09-08 wortgleich in PremiumCard und
// PremiumWillkommen. Sie steht jetzt einmal — und wird hier festgehalten,
// damit sie nicht unbemerkt umbenannt wird: es ist der Name, unter dem
// jemand sein bezahltes Abo im Profil wiederfindet.
describe("planName", () => {
  it("benennt das abgeschlossene Abo, nicht die Auswahl davor", () => {
    expect(planName("monat")).toBe("Monatsabo");
    expect(planName("jahr")).toBe("Jahresabo");
  });

  it("nennt den Gründerpreis beim Namen — Bestandsabos laufen weiter", () => {
    expect(planName("gruender")).toBe("Jahresabo zum Gründerpreis");
  });
});

describe("passZeitraum", () => {
  const JETZT = new Date("2026-09-18T12:00:00.000Z");
  const pass = (ab: string, bis: string) => ({ gueltig_ab: ab, gueltig_bis: bis });

  it("erkennt den laufenden Pass und sein Ende", () => {
    const r = passZeitraum([pass("2026-08-01T00:00:00+00:00", "2027-02-01T00:00:00+00:00")], JETZT);
    expect(r.laeuft).toBe(true);
    expect(r.deckungBis?.toISOString()).toBe("2027-02-01T00:00:00.000Z");
  });

  // DER FALL, AN DEM DIESE FUNKTION HÄNGT.
  //
  // Wer kurz vor Ablauf verlängert, hat zwei Zeilen: eine, die heute gilt,
  // und eine, die erst am Ende der ersten beginnt (apply_saisonpass hängt sie
  // hinten an). Vorher prüfte lib/premium.ts "läuft gerade" am SPÄTEREN Pass
  // — der beginnt aber in der Zukunft. Ergebnis: Premium galt als von Hand
  // gesetzt, das Profil zeigte kein Datum, und die Kaufseite schickte die
  // Person weg, weil deren Ausnahme an quelle === "saisonpass" hängt. Wer
  // bezahlt hatte, war damit ausgesperrt, bis der erste Pass ablief.
  it("zählt eine Verlängerung als laufend und nennt das spätere Ende", () => {
    const r = passZeitraum(
      [
        pass("2026-10-01T00:00:00+00:00", "2027-04-01T00:00:00+00:00"),
        pass("2026-04-01T00:00:00+00:00", "2026-10-01T00:00:00+00:00"),
      ],
      JETZT,
    );
    expect(r.laeuft).toBe(true);
    expect(r.deckungBis?.toISOString()).toBe("2027-04-01T00:00:00.000Z");
  });

  it("meldet nichts, wenn alle Pässe abgelaufen sind", () => {
    expect(passZeitraum([pass("2025-04-01T00:00:00+00:00", "2025-10-01T00:00:00+00:00")], JETZT)).toEqual({
      laeuft: false,
      deckungBis: null,
    });
  });

  // Ein Pass, der erst später beginnt, ohne einen, der heute gilt, kann über
  // apply_saisonpass nicht entstehen. Käme er doch, wäre "läuft" falsch —
  // und dann darf auch kein Enddatum behauptet werden.
  it("behauptet kein Enddatum, solange nichts läuft", () => {
    expect(passZeitraum([pass("2026-12-01T00:00:00+00:00", "2027-06-01T00:00:00+00:00")], JETZT)).toEqual({
      laeuft: false,
      deckungBis: null,
    });
  });

  it("überspringt unlesbare Zeitstempel, statt sie als gültig zu nehmen", () => {
    expect(passZeitraum([pass("keine Zeit", "auch nicht")], JETZT).laeuft).toBe(false);
  });

  // Der Grund für Date.parse statt eines Zeichenkettenvergleichs: PostgREST
  // liefert je nach Zeitzone der Sitzung "+02:00", toISOString() liefert
  // ".000Z". Lexikografisch verglichen läge das um Stunden daneben.
  it("versteht einen Zeitstempel mit lokalem Versatz", () => {
    const r = passZeitraum([pass("2026-08-01T02:00:00+02:00", "2026-09-18T16:00:00+02:00")], JETZT);
    expect(r.laeuft).toBe(true);
  });
});

describe("saisonpassVerlaengerbar", () => {
  const JETZT = new Date("2026-09-18T12:00:00.000Z");

  it("lässt verlängern, wenn gar kein Pass läuft", () => {
    expect(saisonpassVerlaengerbar(null, JETZT)).toBe(true);
  });

  it("lässt verlängern, sobald der Pass in weniger als 30 Tagen endet", () => {
    expect(saisonpassVerlaengerbar(new Date("2026-10-10T12:00:00.000Z"), JETZT)).toBe(true);
  });

  it("wehrt den Doppelkauf mitten in der Saison ab", () => {
    expect(saisonpassVerlaengerbar(new Date("2027-02-01T12:00:00.000Z"), JETZT)).toBe(false);
  });
});
