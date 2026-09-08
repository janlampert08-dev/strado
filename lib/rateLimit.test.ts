import { describe, expect, it } from "vitest";
import { getClientIp, isRateLimited, isRateLimitedByKey } from "@/lib/rateLimit";

// Minimaler Chainable-Mock für den Teil der Supabase-Query-Builder-API, den
// isRateLimited tatsächlich nutzt (.from().select().eq().order().limit().maybeSingle()).
function makeMockSupabase(
  row: Record<string, string> | null,
  error: { message: string } | null = null,
) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: row, error }),
  };
  return { from: () => chain } as unknown as Parameters<typeof isRateLimited>[0];
}

describe("isRateLimited", () => {
  it("is not limited when the user has no prior rows", async () => {
    const supabase = makeMockSupabase(null);
    expect(await isRateLimited(supabase, "t", "created_at", "user_id", "u1", 5000)).toBe(false);
  });

  it("is limited when the last row is within the cooldown window", async () => {
    const supabase = makeMockSupabase({ created_at: new Date().toISOString() });
    expect(await isRateLimited(supabase, "t", "created_at", "user_id", "u1", 5000)).toBe(true);
  });

  it("is not limited once the cooldown window has passed", async () => {
    const old = new Date(Date.now() - 10_000).toISOString();
    const supabase = makeMockSupabase({ created_at: old });
    expect(await isRateLimited(supabase, "t", "created_at", "user_id", "u1", 5000)).toBe(false);
  });

  // Der Fehlerfall lieferte bisher data=null und damit dasselbe Ergebnis wie
  // "noch nie geschrieben": die Bremse fiel bei jedem Datenbankproblem
  // lautlos aus. Sie schliesst jetzt.
  it("bremst vorsorglich, wenn die Abfrage fehlschlägt", async () => {
    const supabase = makeMockSupabase(null, { message: "connection refused" });
    expect(await isRateLimited(supabase, "t", "created_at", "user_id", "u1", 5000)).toBe(true);
  });

  it("bremst auch dann, wenn neben dem Fehler eine Zeile zurückkommt", async () => {
    const alt = new Date(Date.now() - 10_000).toISOString();
    const supabase = makeMockSupabase({ created_at: alt }, { message: "timeout" });
    expect(await isRateLimited(supabase, "t", "created_at", "user_id", "u1", 5000)).toBe(true);
  });
});

describe("isRateLimitedByKey", () => {
  it("allows up to the given limit within the window", () => {
    const key = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i++) {
      expect(isRateLimitedByKey(key, 3, 60_000)).toBe(false);
    }
  });

  it("blocks once the limit is exceeded within the window", () => {
    const key = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i++) isRateLimitedByKey(key, 3, 60_000);
    expect(isRateLimitedByKey(key, 3, 60_000)).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    const keyA = `test:${crypto.randomUUID()}`;
    const keyB = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i++) isRateLimitedByKey(keyA, 3, 60_000);
    expect(isRateLimitedByKey(keyA, 3, 60_000)).toBe(true);
    expect(isRateLimitedByKey(keyB, 3, 60_000)).toBe(false);
  });

  it("allows requests again once the window has passed", () => {
    const key = `test:${crypto.randomUUID()}`;
    // Ein negatives Fenster bedeutet, dass jeder frühere Treffer sofort als
    // abgelaufen gilt — simuliert den Zustand "Fenster ist vorbei", ohne in
    // den Tests echte Zeit verstreichen lassen zu müssen.
    for (let i = 0; i < 3; i++) isRateLimitedByKey(key, 3, -1);
    expect(isRateLimitedByKey(key, 3, -1)).toBe(false);
  });
});

describe("getClientIp", () => {
  it("reads the first entry of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(headers)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(getClientIp(headers)).toBe("9.9.9.9");
  });

  it("falls back to 'unknown' without any proxy header", () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe("unknown");
  });
});
