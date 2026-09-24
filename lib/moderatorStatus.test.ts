import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istFunktionUnbekannt, leseModeratorStatus } from "./moderatorStatus";

type Antwort = { data: unknown; error: { code?: string } | null };

// Minimaler Client: rpc("ist_moderator") und die Kette
// from("profiles").select().eq().maybeSingle() für den Rückweg.
function client(rpc: Antwort, spalte: Antwort = { data: null, error: null }) {
  const maybeSingle = vi.fn().mockResolvedValue(spalte);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpcFn = vi.fn().mockResolvedValue(rpc);
  const c = { rpc: rpcFn, from } as unknown as SupabaseClient;
  return { c, rpcFn, from, eq };
}

describe("leseModeratorStatus", () => {
  it("nimmt die Antwort von ist_moderator()", async () => {
    const { c, rpcFn, from } = client({ data: true, error: null });
    expect(await leseModeratorStatus(c, "u1")).toBe(true);
    expect(rpcFn).toHaveBeenCalledWith("ist_moderator");
    // Kein Spaltenlesen, wenn die Funktion antwortet — die Spalte ist seit 0134 gesperrt.
    expect(from).not.toHaveBeenCalled();
  });

  it("false und null von ist_moderator() heissen: kein Moderator", async () => {
    expect(await leseModeratorStatus(client({ data: false, error: null }).c, "u1")).toBe(false);
    expect(await leseModeratorStatus(client({ data: null, error: null }).c, "u1")).toBe(false);
  });

  it("liest die Spalte nur, wenn die Funktion fehlt (0134 noch nicht eingespielt)", async () => {
    const { c, from, eq } = client(
      { data: null, error: { code: "PGRST202" } },
      { data: { is_moderator: true }, error: null },
    );
    expect(await leseModeratorStatus(c, "u1")).toBe(true);
    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });

  it("jeder andere Fehler zählt als kein Moderator, ohne Rückweg", async () => {
    const { c, from } = client(
      { data: null, error: { code: "42501" } },
      { data: { is_moderator: true }, error: null },
    );
    expect(await leseModeratorStatus(c, "u1")).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("istFunktionUnbekannt", () => {
  it("erkennt nur die fehlende Funktion", () => {
    expect(istFunktionUnbekannt({ code: "PGRST202" })).toBe(true);
    expect(istFunktionUnbekannt({ code: "42883" })).toBe(true);
    expect(istFunktionUnbekannt({ code: "42501" })).toBe(false);
    expect(istFunktionUnbekannt(null)).toBe(false);
  });
});
