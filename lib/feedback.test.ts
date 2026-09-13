import { describe, expect, it } from "vitest";
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  istFeedbackKategorie,
  pruefeFeedback,
} from "@/lib/feedback";
import { FEEDBACK_KATEGORIEN } from "@/lib/constants";

const GUELTIG = "Die Karte ruckelt beim Zoomen auf dem iPhone.";

describe("istFeedbackKategorie", () => {
  it("accepts every category offered in the form", () => {
    for (const k of FEEDBACK_KATEGORIEN) {
      expect(istFeedbackKategorie(k.value)).toBe(true);
    }
  });

  it("rejects a value that is not in the list", () => {
    expect(istFeedbackKategorie("beschwerde")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(istFeedbackKategorie(undefined)).toBe(false);
    expect(istFeedbackKategorie(null)).toBe(false);
    expect(istFeedbackKategorie(42)).toBe(false);
  });
});

describe("pruefeFeedback", () => {
  it("accepts a well-formed submission", () => {
    const ergebnis = pruefeFeedback("fehler", GUELTIG);
    expect(ergebnis).toEqual({ ok: true, kategorie: "fehler", nachricht: GUELTIG });
  });

  it("returns the trimmed message, not the raw one", () => {
    const ergebnis = pruefeFeedback("idee", `  ${GUELTIG}\n\n`);
    expect(ergebnis).toEqual({ ok: true, kategorie: "idee", nachricht: GUELTIG });
  });

  it("rejects a category the form does not offer", () => {
    const ergebnis = pruefeFeedback("beschwerde", GUELTIG);
    expect(ergebnis.ok).toBe(false);
  });

  // Ohne Trimmen vor der Längenprüfung ginge das als gültig durch und
  // scheiterte erst an der CHECK-Beschränkung in 0083_feedback.sql.
  it("rejects whitespace that only looks long enough", () => {
    const ergebnis = pruefeFeedback("lob", " ".repeat(FEEDBACK_MIN_LENGTH + 5));
    expect(ergebnis.ok).toBe(false);
  });

  it("rejects a message below the minimum length", () => {
    expect(pruefeFeedback("lob", "a".repeat(FEEDBACK_MIN_LENGTH - 1)).ok).toBe(false);
  });

  it("accepts a message of exactly the minimum length", () => {
    expect(pruefeFeedback("lob", "a".repeat(FEEDBACK_MIN_LENGTH)).ok).toBe(true);
  });

  it("accepts a message of exactly the maximum length", () => {
    expect(pruefeFeedback("sonstiges", "a".repeat(FEEDBACK_MAX_LENGTH)).ok).toBe(true);
  });

  // Bewusst abweisen statt kürzen — der Text IST die Einsendung.
  it("rejects an over-long message instead of truncating it", () => {
    const ergebnis = pruefeFeedback("sonstiges", "a".repeat(FEEDBACK_MAX_LENGTH + 1));
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.error).toContain(String(FEEDBACK_MAX_LENGTH));
  });

  it("rejects a missing message", () => {
    expect(pruefeFeedback("fehler", undefined).ok).toBe(false);
    expect(pruefeFeedback("fehler", null).ok).toBe(false);
  });
});
