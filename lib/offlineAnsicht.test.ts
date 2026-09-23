import { describe, expect, it } from "vitest";
import { angefragteStreckenId } from "./offlineAnsicht";

describe("angefragteStreckenId", () => {
  it("liest die Strecke aus der angefragten Streckenseite", () => {
    expect(angefragteStreckenId("/strecken/0f1e2d3c-aaaa-bbbb-cccc-123456789abc")).toBe(
      "0f1e2d3c-aaaa-bbbb-cccc-123456789abc",
    );
    expect(angefragteStreckenId("/strecken/abc/")).toBe("abc");
  });

  it("ignoriert alles andere", () => {
    expect(angefragteStreckenId("/offline")).toBeNull();
    expect(angefragteStreckenId("/strecken")).toBeNull();
    expect(angefragteStreckenId("/strecken/abc/bearbeiten")).toBeNull();
    expect(angefragteStreckenId("/fahrten/abc")).toBeNull();
  });

  it("scheitert nicht an kaputter Kodierung", () => {
    expect(angefragteStreckenId("/strecken/%E0%A4%A")).toBeNull();
  });
});
