import { describe, expect, it } from "vitest";
import { BILD_ENDUNGEN, bildEndungFuerMime, isValidUuid } from "@/lib/validation";

describe("isValidUuid", () => {
  it("accepts a well-formed v4 uuid", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("accepts uppercase uuids", () => {
    expect(isValidUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidUuid("")).toBe(false);
  });

  it("rejects a non-uuid string", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
  });

  it("rejects an oversized/malformed payload instead of throwing", () => {
    expect(isValidUuid("a".repeat(10_000))).toBe(false);
  });

  it("rejects a uuid missing a segment", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716")).toBe(false);
  });
});

describe("bildEndungFuerMime", () => {
  it("maps every MIME type of the bucket allowlist", () => {
    expect(bildEndungFuerMime("image/jpeg")).toBe("jpg");
    expect(bildEndungFuerMime("image/png")).toBe("png");
    expect(bildEndungFuerMime("image/webp")).toBe("webp");
    expect(bildEndungFuerMime("image/gif")).toBe("gif");
  });

  it("normalises the case of the reported content type", () => {
    expect(bildEndungFuerMime("IMAGE/JPEG")).toBe("jpg");
  });

  it("rejects a type the bucket allowlist does not carry", () => {
    expect(bildEndungFuerMime("image/svg+xml")).toBeNull();
    expect(bildEndungFuerMime("application/pdf")).toBeNull();
    expect(bildEndungFuerMime("")).toBeNull();
  });

  it("rejects prototype keys instead of returning an inherited member", () => {
    // foto.type ist client-kontrolliert. Ohne prototypenfreies Nachschlagen
    // liefern diese Keys Object.prototype-Member statt undefined — der
    // truthy Wert landete dann als geratene Endung im Storage-Key.
    expect(bildEndungFuerMime("constructor")).toBeNull();
    expect(bildEndungFuerMime("toString")).toBeNull();
    expect(bildEndungFuerMime("__proto__")).toBeNull();
    expect(bildEndungFuerMime("hasOwnProperty")).toBeNull();
  });
});

// Die Liste steuert das Aufräumen alter Avatar-Fassungen (uploadAvatar und
// deleteAccount): Fehlt eine Endung darin, bleibt genau diese Datei nach dem
// Ersetzen bzw. nach der Kontolöschung im öffentlichen avatars-Bucket
// liegen. Sie muss deshalb deckungsgleich mit dem sein, was
// bildEndungFuerMime() überhaupt vergeben kann.
describe("BILD_ENDUNGEN", () => {
  it("enthält jede Endung, die bildEndungFuerMime vergeben kann", () => {
    const vergeben = ["image/jpeg", "image/png", "image/webp", "image/gif"].map((mime) =>
      bildEndungFuerMime(mime),
    );
    for (const endung of vergeben) {
      expect(endung).not.toBeNull();
      expect(BILD_ENDUNGEN).toContain(endung as string);
    }
  });

  it("enthält keine Endung, die nie vergeben wird", () => {
    expect(BILD_ENDUNGEN).toHaveLength(new Set(BILD_ENDUNGEN).size);
    expect(BILD_ENDUNGEN).not.toContain("svg");
  });
});
