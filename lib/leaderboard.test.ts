import { describe, expect, it } from "vitest";
import {
  dedupeRouteLeaderboardRows,
  klassenAusZeilen,
  toEntry,
  type LeaderboardUserTotalsRow,
  type RouteLeaderboardRow,
} from "@/lib/leaderboard";

function totalsRow(overrides: Partial<LeaderboardUserTotalsRow>): LeaderboardUserTotalsRow {
  return {
    user_id: "u1",
    display_name: "Alice",
    avatar_url: null,
    fahrten_count: 3,
    hoehenmeter: 2000,
    km: 40,
    strecken_count: 2,
    ...overrides,
  };
}

function routeRow(overrides: Partial<RouteLeaderboardRow>): RouteLeaderboardRow {
  return {
    completion_id: "c1",
    user_id: "u1",
    display_name: "Alice",
    avatar_url: null,
    dauer_sekunden: 1000,
    motorklasse: null,
    ...overrides,
  };
}

// Die eigentliche Summierung/Deduplizierung (Fahrten zählen, Höhenmeter/km
// summieren, unterschiedliche Strecken zählen) läuft seit
// 0054_leaderboard_user_totals.sql serverseitig in der SQL-View — hier bleibt
// nur noch die reine Zeile-zu-LeaderboardEntry-Abbildung testbar. Die
// Aggregations-Formeln selbst sind in der Migration dokumentiert und nicht
// mehr durch diese Suite abgedeckt.
describe("toEntry", () => {
  it("uses display_name when present", () => {
    const entry = toEntry(totalsRow({ user_id: "u1", display_name: "Alice" }), 5);
    expect(entry).toEqual({
      userId: "u1",
      name: "Alice",
      avatarUrl: null,
      value: 5,
    });
  });

  it("falls back to 'Anonym' when display_name is missing", () => {
    expect(toEntry(totalsRow({ display_name: null }), 5).name).toBe("Anonym");
  });

  it("passes the already-gated avatar_url through unchanged", () => {
    expect(toEntry(totalsRow({ avatar_url: "https://example.com/a.jpg" }), 1).avatarUrl).toBe(
      "https://example.com/a.jpg",
    );
    expect(toEntry(totalsRow({ avatar_url: null }), 1).avatarUrl).toBeNull();
  });

  it("uses the value passed in rather than re-reading a metric off the row", () => {
    // topByMetric übergibt den Wert der jeweiligen Metrik explizit
    // (z.B. row.hoehenmeter) statt dass toEntry ihn selbst vom Feld liest —
    // beide bleiben so unabhängig voneinander.
    expect(toEntry(totalsRow({ hoehenmeter: 999 }), 42).value).toBe(42);
  });
});

describe("dedupeRouteLeaderboardRows", () => {
  it("keeps only a user's fastest completion when they appear multiple times", () => {
    const rows = [
      routeRow({ completion_id: "c1", user_id: "u1", dauer_sekunden: 500 }),
      routeRow({ completion_id: "c2", user_id: "u1", dauer_sekunden: 700 }), // langsamere Zweitfahrt
      routeRow({ completion_id: "c3", user_id: "u2", dauer_sekunden: 600 }),
    ];
    const result = dedupeRouteLeaderboardRows(rows, 10);
    expect(result).toHaveLength(2);
    const byUser = new Map(result.map((r) => [r.user_id, r.completion_id]));
    expect(byUser.get("u1")).toBe("c1");
    expect(byUser.get("u2")).toBe("c3");
  });

  it("preserves ascending order by dauer_sekunden and breaks ties by input order", () => {
    const rows = [
      routeRow({ completion_id: "c1", user_id: "u1", dauer_sekunden: 400 }),
      routeRow({ completion_id: "c2", user_id: "u2", dauer_sekunden: 400 }), // Gleichstand mit u1
      routeRow({ completion_id: "c3", user_id: "u3", dauer_sekunden: 900 }),
    ];
    const result = dedupeRouteLeaderboardRows(rows, 10);
    expect(result.map((r) => r.completion_id)).toEqual(["c1", "c2", "c3"]);
  });

  it("returns exactly topN distinct users when more are available", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      routeRow({ completion_id: `c${i}`, user_id: `u${i}`, dauer_sekunden: 100 + i }),
    );
    // jeder Nutzer fährt zusätzlich eine langsamere Zweitrunde
    const secondRuns = rows.map((r) =>
      routeRow({ completion_id: `${r.completion_id}b`, user_id: r.user_id, dauer_sekunden: r.dauer_sekunden + 1000 }),
    );
    const allSorted = [...rows, ...secondRuns].sort((a, b) => a.dauer_sekunden - b.dauer_sekunden);

    const result = dedupeRouteLeaderboardRows(allSorted, 10);
    expect(result).toHaveLength(10);
    expect(new Set(result.map((r) => r.user_id)).size).toBe(10);
    // die zehn schnellsten unterschiedlichen Nutzer, nicht durch Zweitrunden verdrängt
    expect(result.map((r) => r.user_id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `u${i}`),
    );
  });
});

// Speist die Chip-Leiste der Streckenbestzeiten: pro Strecke sollen nur die
// Klassen erscheinen, in denen wirklich jemand eine Zeit geteilt hat.
describe("klassenAusZeilen", () => {
  it("fasst mehrfach vorkommende Klassen zu einer zusammen", () => {
    expect(
      klassenAusZeilen([
        { motorklasse: "moto_a1" },
        { motorklasse: "auto_bis110" },
        { motorklasse: "moto_a1" },
      ]),
    ).toEqual(["moto_a1", "auto_bis110"]);
  });

  it("lässt Fahrten ohne Klasse weg", () => {
    // Eine Fahrt ohne Fahrzeug oder ohne Leistungsangabe zählt weiter in
    // "Alle", darf aber keinen leeren Chip erzeugen.
    expect(klassenAusZeilen([{ motorklasse: null }, { motorklasse: "moto_a" }])).toEqual([
      "moto_a",
    ]);
  });

  it("liefert für eine Strecke ohne geteilte Zeiten nichts", () => {
    expect(klassenAusZeilen([])).toEqual([]);
  });
});
