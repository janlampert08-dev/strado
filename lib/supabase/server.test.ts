import { beforeEach, describe, expect, it, vi } from "vitest";

// Geprüft wird, WAS getCurrentUser() und getFreshUser() von der
// Auth-Bibliothek verlangen und wie die Antwort ankommt — nicht die
// Signaturprüfung selbst, die gehört @supabase/auth-js.
const auth = {
  getClaims: vi.fn(),
  getUser: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth }),
}));

const { getCurrentUser, getFreshUser } = await import("@/lib/supabase/server");

const NUTZER = "9e5867c8-03a0-472f-8274-ba26deaf2743";

beforeEach(() => {
  auth.getClaims.mockReset();
  auth.getUser.mockReset();
});

describe("getCurrentUser", () => {
  it("liest den Nutzer aus den geprüften Claims, ohne GoTrue zu fragen", async () => {
    auth.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: NUTZER,
          email: "fahrer@example.ch",
          user_metadata: { einrichtung_erledigt_am: "2026-09-24T10:00:00Z" },
          app_metadata: { provider: "google" },
          is_anonymous: false,
          role: "authenticated",
        },
      },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toEqual({
      id: NUTZER,
      email: "fahrer@example.ch",
      user_metadata: { einrichtung_erledigt_am: "2026-09-24T10:00:00Z" },
      app_metadata: { provider: "google" },
      is_anonymous: false,
    });
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("gibt null ohne gültige Claims (abgelaufen, falsche Signatur, keine Sitzung)", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: new Error("Invalid JWT signature") });
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("gibt null, wenn das Token keinen Nutzer trägt", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { role: "anon" } }, error: null });
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("füllt fehlende Metadaten mit leeren Objekten", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: NUTZER } }, error: null });
    const user = await getCurrentUser();
    expect(user?.user_metadata).toEqual({});
    expect(user?.app_metadata).toEqual({});
    expect(user?.email).toBeUndefined();
  });
});

describe("getFreshUser", () => {
  it("fragt GoTrue und gibt den vollständigen User zurück", async () => {
    const user = { id: NUTZER, email: "fahrer@example.ch", created_at: "2026-09-01T00:00:00Z" };
    auth.getUser.mockResolvedValue({ data: { user }, error: null });
    await expect(getFreshUser()).resolves.toBe(user);
    expect(auth.getClaims).not.toHaveBeenCalled();
  });
});
