import { describe, expect, it } from "vitest";
import { eigenerPremiumStatus } from "@/lib/meinPremium";

// Seit 0154 liest getPremiumStatus() den eigenen Abo-Status über
// rpc("mein_premium"); die Spalte profiles.ist_premium ist für
// authenticated nicht mehr lesbar. Der Weg über die Spalte bleibt nur als
// Rückfall, solange die Funktion noch nicht existiert (PGRST202).
//
// Wie in lib/publicTrack.test.ts: kein Mocking-Framework, sondern das
// kleinste Objekt, das die benutzte Kette anbietet.
function fakeClient(
  rpc: { data: unknown; error: unknown },
  spalte: { data: unknown; error: unknown } = { data: null, error: { message: "unerwartet" } },
) {
  const aufrufe = { spalte: 0 };
  const kette = {
    select: () => kette,
    eq: () => kette,
    maybeSingle: async () => {
      aufrufe.spalte += 1;
      return spalte;
    },
  };
  const client = {
    rpc: async () => rpc,
    from: () => kette,
  } as never;
  return { client, aufrufe };
}

const FEHLT = { data: null, error: { code: "PGRST202", message: "not found" } };

describe("eigenerPremiumStatus", () => {
  it("liefert true aus mein_premium() und fasst die Spalte nicht an", async () => {
    const { client, aufrufe } = fakeClient({ data: true, error: null });
    await expect(eigenerPremiumStatus(client, "u1")).resolves.toEqual({ aktiv: true, fehler: null });
    expect(aufrufe.spalte).toBe(0);
  });

  it("liefert false aus mein_premium()", async () => {
    const { client } = fakeClient({ data: false, error: null });
    await expect(eigenerPremiumStatus(client, "u1")).resolves.toEqual({ aktiv: false, fehler: null });
  });

  it("gibt einen Lesefehler weiter, statt ihn zu Gratis zu machen", async () => {
    const fehler = { code: "42501", message: "permission denied" };
    const { client, aufrufe } = fakeClient({ data: null, error: fehler });
    await expect(eigenerPremiumStatus(client, "u1")).resolves.toEqual({ aktiv: false, fehler });
    expect(aufrufe.spalte).toBe(0);
  });

  it("fällt vor 0154 auf die Spalte zurück", async () => {
    const { client, aufrufe } = fakeClient(FEHLT, { data: { ist_premium: true }, error: null });
    await expect(eigenerPremiumStatus(client, "u1")).resolves.toEqual({ aktiv: true, fehler: null });
    expect(aufrufe.spalte).toBe(1);
  });

  it("gibt auch einen Fehler des Rückfalls weiter", async () => {
    const fehler = { code: "42501", message: "permission denied" };
    const { client } = fakeClient(FEHLT, { data: null, error: fehler });
    await expect(eigenerPremiumStatus(client, "u1")).resolves.toEqual({ aktiv: false, fehler });
  });

  it("gilt ohne Profilzeile als kein Premium", async () => {
    const { client } = fakeClient(FEHLT, { data: null, error: null });
    await expect(eigenerPremiumStatus(client, "u1")).resolves.toEqual({ aktiv: false, fehler: null });
  });
});
