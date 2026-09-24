import { describe, expect, it } from "vitest";
import { aktiveOAuthAnbieter } from "@/lib/oauth";

describe("aktiveOAuthAnbieter", () => {
  it("ist ohne Variable leer", () => {
    expect(aktiveOAuthAnbieter(undefined)).toEqual([]);
    expect(aktiveOAuthAnbieter("")).toEqual([]);
  });

  it("kennt google, egal in welcher Schreibweise", () => {
    expect(aktiveOAuthAnbieter("google")).toEqual(["google"]);
    expect(aktiveOAuthAnbieter(" Google ")).toEqual(["google"]);
  });

  it("lässt Unbekanntes fallen statt zu raten", () => {
    expect(aktiveOAuthAnbieter("google,apple,facebook")).toEqual(["google"]);
    expect(aktiveOAuthAnbieter("apple")).toEqual([]);
  });

  it("nennt keinen Anbieter doppelt", () => {
    expect(aktiveOAuthAnbieter("google,google")).toEqual(["google"]);
  });
});
