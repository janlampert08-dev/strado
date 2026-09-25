import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ladeFollowerZahlen } from "./followerZahlen";

type Antwort = { data: unknown; error: { code?: string } | null };

// Minimaler Client: rpc("get_follow_counts_many", …) antwortet direkt,
// rpc("get_follow_counts", …).single() je Konto für den Rückweg.
function client(sammel: Antwort, einzeln: Record<string, Antwort> = {}) {
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    if (name === "get_follow_counts_many") return Promise.resolve(sammel);
    const antwort = einzeln[args.p_user_id as string] ?? { data: null, error: null };
    return { single: () => Promise.resolve(antwort) };
  });
  return { c: { rpc } as unknown as SupabaseClient, rpc };
}

describe("ladeFollowerZahlen", () => {
  it("fragt alle Konten in einem Aufruf ab", async () => {
    const { c, rpc } = client({
      data: [
        { user_id: "a", followers: 3, following: 1 },
        { user_id: "b", followers: 0, following: 0 },
      ],
      error: null,
    });
    const zahlen = await ladeFollowerZahlen(c, ["a", "b"]);
    expect(zahlen.get("a")).toBe(3);
    expect(zahlen.get("b")).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_follow_counts_many", { user_ids: ["a", "b"] });
  });

  it.each(["PGRST202", "42883"])(
    "fällt auf Einzelaufrufe zurück, wenn die Funktion fehlt (%s)",
    async (code) => {
      const { c, rpc } = client(
        { data: null, error: { code } },
        {
          a: { data: { followers: 5, following: 2 }, error: null },
          b: { data: { followers: 1, following: 0 }, error: null },
        },
      );
      const zahlen = await ladeFollowerZahlen(c, ["a", "b"]);
      expect(zahlen.get("a")).toBe(5);
      expect(zahlen.get("b")).toBe(1);
      expect(rpc).toHaveBeenCalledWith("get_follow_counts", { p_user_id: "a" });
      expect(rpc).toHaveBeenCalledWith("get_follow_counts", { p_user_id: "b" });
      expect(rpc).toHaveBeenCalledTimes(3);
    },
  );

  it("ein fehlgeschlagener Einzelaufruf im Rückweg ergibt 0", async () => {
    const { c } = client(
      { data: null, error: { code: "PGRST202" } },
      { a: { data: null, error: { code: "57014" } } },
    );
    expect((await ladeFollowerZahlen(c, ["a"])).get("a")).toBe(0);
  });

  it("jeder andere Fehler ergibt 0 für alle, ohne Rückweg", async () => {
    const { c, rpc } = client({ data: null, error: { code: "42501" } });
    const zahlen = await ladeFollowerZahlen(c, ["a"]);
    expect(zahlen.get("a") ?? 0).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("ruft ohne IDs gar nichts auf", async () => {
    const { c, rpc } = client({ data: [], error: null });
    expect((await ladeFollowerZahlen(c, [])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
