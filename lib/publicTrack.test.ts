import { describe, expect, it, vi } from "vitest";
import { privacyRadiusM } from "@/lib/publicTrack";
import { MAX_PRIVACY_RADIUS_M, PRIVACY_RADIUS_OPTIONS } from "@/lib/track";

// privacyRadiusM entscheidet, wie viel vom Anfang und Ende eines geteilten
// GPS-Tracks abgeschnitten wird — also darüber, ob eine veröffentlichte
// Fahrt die Wohnadresse des Fahrers preisgibt. Der interessante Fall ist
// nicht der Normalbetrieb, sondern der Lesefehler: Vorher fiel die Funktion
// dann auf den Standardwert (200 m) zurück und schwächte damit still die
// Einstellung jedes Kontos ab, das 500 m gewählt hatte.
//
// Der Supabase-Client wird nicht gemockt, sondern durch das kleinste Objekt
// ersetzt, das die benutzte Kette anbietet — dieselbe Linie wie in den
// übrigen Tests hier (kein Mocking-Framework über Vitest hinaus).
function fakeClient(antwort: { data: unknown; error: unknown }) {
  const kette = {
    select: () => kette,
    eq: () => kette,
    maybeSingle: async () => antwort,
  };
  return { from: () => kette } as never;
}

describe("privacyRadiusM", () => {
  it("liefert den eingestellten Radius", async () => {
    const client = fakeClient({ data: { privatzone_radius_m: 100 }, error: null });
    await expect(privacyRadiusM(client, "u1")).resolves.toBe(100);
  });

  it("liefert 0, wenn der Nutzer die Privatzone bewusst abgeschaltet hat", async () => {
    // 0 ist ein gültiger Wert und darf nicht über ?? in den Rückfall laufen.
    const client = fakeClient({ data: { privatzone_radius_m: 0 }, error: null });
    await expect(privacyRadiusM(client, "u1")).resolves.toBe(0);
  });

  it("kappt bei einem Lesefehler maximal statt auf den Standard", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient({ data: null, error: { message: "boom" } });
    await expect(privacyRadiusM(client, "u1")).resolves.toBe(MAX_PRIVACY_RADIUS_M);
    spy.mockRestore();
  });

  it("kappt maximal, wenn kein Profil gefunden wird", async () => {
    const client = fakeClient({ data: null, error: null });
    await expect(privacyRadiusM(client, "u1")).resolves.toBe(MAX_PRIVACY_RADIUS_M);
  });

  it("nutzt als Rückfall wirklich die strengste angebotene Stufe", () => {
    for (const option of PRIVACY_RADIUS_OPTIONS) {
      expect(MAX_PRIVACY_RADIUS_M).toBeGreaterThanOrEqual(option);
    }
  });
});
