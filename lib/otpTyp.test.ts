import { describe, expect, it } from "vitest";
import { OTP_RECOVERY, OTP_SIGNUP, istErlaubterOtpTyp } from "@/lib/otpTyp";

describe("istErlaubterOtpTyp", () => {
  it("erlaubt die beiden Typen, die unsere E-Mails erzeugen", () => {
    expect(istErlaubterOtpTyp(OTP_RECOVERY)).toBe(true);
    expect(istErlaubterOtpTyp(OTP_SIGNUP)).toBe(true);
  });

  it("erlaubt email_change NICHT", () => {
    // Der Typ kommt aus der Adresszeile und geht direkt an verifyOtp().
    // email_change schreibt die Adresse eines Kontos um — unsere E-Mails
    // erzeugen so etwas nicht, also darf der Callback es auch nicht einlösen.
    expect(istErlaubterOtpTyp("email_change")).toBe(false);
    expect(istErlaubterOtpTyp("email_change_current")).toBe(false);
    expect(istErlaubterOtpTyp("email_change_new")).toBe(false);
  });

  it("erlaubt keine anderen GoTrue-Typen", () => {
    for (const typ of ["magiclink", "invite", "sms", "phone_change", "email"]) {
      expect(istErlaubterOtpTyp(typ)).toBe(false);
    }
  });

  it("erlaubt nichts, was gar kein String ist", () => {
    expect(istErlaubterOtpTyp(null)).toBe(false);
    expect(istErlaubterOtpTyp(undefined)).toBe(false);
    expect(istErlaubterOtpTyp("")).toBe(false);
  });

  it("vergleicht exakt, nicht als Präfix", () => {
    expect(istErlaubterOtpTyp("recovery_x")).toBe(false);
    expect(istErlaubterOtpTyp(" recovery")).toBe(false);
    expect(istErlaubterOtpTyp("RECOVERY")).toBe(false);
  });
});
