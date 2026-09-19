import { describe, expect, it } from "vitest";
import { rumpfIstBrauchbar } from "@/lib/astraFeed";

describe("rumpfIstBrauchbar", () => {
  it("lässt einen leeren Rumpf durch — ein Delta ohne Änderung", () => {
    expect(rumpfIstBrauchbar("")).toBe(true);
    expect(rumpfIstBrauchbar("   \n  ")).toBe(true);
  });

  it("erkennt eine echte Lieferung, auch mit wechselndem Namensraum", () => {
    expect(rumpfIstBrauchbar('<d2LogicalModel xmlns="http://datex2.eu/schema/2/2_0">')).toBe(true);
    expect(rumpfIstBrauchbar("<ns2:d2LogicalModel>")).toBe(true);
    expect(rumpfIstBrauchbar("<soap:Envelope><payloadPublication /></soap:Envelope>")).toBe(true);
  });

  it("weist einen Störfall zurück, der mit HTTP 200 kommt", () => {
    // Das ist der Fall, der vorher als "nichts geändert" durchging und den
    // Lauf als Erfolg stempelte.
    expect(rumpfIstBrauchbar("<html><body>503 Service Unavailable</body></html>")).toBe(false);
    expect(
      rumpfIstBrauchbar('<soap:Envelope><soap:Fault><faultstring>quota</faultstring></soap:Fault></soap:Envelope>'),
    ).toBe(false);
    expect(rumpfIstBrauchbar('{"error":"invalid subscription"}')).toBe(false);
  });

  it("lässt sich nicht von einem blossen Wortvorkommen täuschen", () => {
    expect(rumpfIstBrauchbar("d2LogicalModel wurde nicht geliefert")).toBe(false);
  });
});
