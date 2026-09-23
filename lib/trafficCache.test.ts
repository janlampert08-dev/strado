import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCongestionLevels } from "@/lib/traffic";

// Detailkarte und FahrCheck fragen auf der Streckenseite dieselbe Linie ab —
// Mapbox soll das nur einmal sehen.
describe("fetchCongestionLevels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("teilt eine Abfrage derselben Linie, statt sie doppelt an Mapbox zu schicken", async () => {
    const abruf = vi.fn(async () =>
      new Response(JSON.stringify({ features: [{ properties: { congestion: "heavy" } }] })),
    );
    vi.stubGlobal("fetch", abruf);
    const linie: [number, number][] = [
      [8.1, 46.1],
      [8.2, 46.2],
      [8.3, 46.3],
    ];

    const [a, b] = await Promise.all([
      fetchCongestionLevels(linie, 3, "token"),
      fetchCongestionLevels(linie, 3, "token"),
    ]);

    expect(a).toEqual(b);
    expect(a.every((l) => l === "heavy")).toBe(true);
    expect(abruf).toHaveBeenCalledTimes(3);
  });
});
