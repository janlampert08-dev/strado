import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// app/sitemap.ts baut die Origin aus den Request-Headern und die
// Streckenliste aus Supabase. Beides hier ersetzt, damit der Test das
// Antwortverhalten prüft und nicht die Umgebung.
const getOrigin = vi.fn<() => Promise<string>>();
const listRoutesForSitemap = vi.fn<() => Promise<{ id: string; created_at: string }[]>>();

vi.mock("@/lib/utils/url", () => ({ getOrigin: () => getOrigin() }));
vi.mock("@/lib/routes", () => ({ listRoutesForSitemap: () => listRoutesForSitemap() }));

import sitemap, { revalidate, dynamic } from "@/app/sitemap";

const STATISCH = ["", "/ranglisten", "/paesse", "/premium", "/verifiziert"];

describe("app/sitemap.ts", () => {
  beforeEach(() => {
    getOrigin.mockResolvedValue("https://app.strado.ch");
    listRoutesForSitemap.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("wird stündlich neu gebaut, nicht bei jedem Abruf", () => {
    expect(revalidate).toBe(3600);
    expect(dynamic).toBe("force-dynamic");
  });

  it("liefert die statischen Adressen und je Strecke eine URL", async () => {
    listRoutesForSitemap.mockResolvedValue([
      { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-09-17T16:15:03.387468+00:00" },
    ]);
    const eintraege = await sitemap();
    const urls = eintraege.map((e) => e.url);
    for (const pfad of STATISCH) {
      expect(urls).toContain(`https://app.strado.ch${pfad}`);
    }
    expect(urls).toContain(
      "https://app.strado.ch/strecken/11111111-1111-4111-8111-111111111111",
    );
  });

  // Der Googlebot-Fall: reisst die DB, muss trotzdem valides XML mit den
  // statischen Adressen kommen statt eines 500ers ("Couldn't fetch").
  it("liefert die statischen Adressen auch bei DB-Fehler", async () => {
    listRoutesForSitemap.mockRejectedValue(new Error("DB weg"));
    const eintraege = await sitemap();
    const urls = eintraege.map((e) => e.url);
    for (const pfad of STATISCH) {
      expect(urls).toContain(`https://app.strado.ch${pfad}`);
    }
  });

  it("antwortet auch bei hängender DB innert Budget mit den statischen Adressen", async () => {
    vi.useFakeTimers();
    listRoutesForSitemap.mockReturnValue(new Promise(() => {}));
    const abruf = sitemap();
    await vi.advanceTimersByTimeAsync(8000);
    const eintraege = await abruf;
    const urls = eintraege.map((e) => e.url);
    for (const pfad of STATISCH) {
      expect(urls).toContain(`https://app.strado.ch${pfad}`);
    }
  });

  it("fällt bei kaputter Origin auf die konfigurierte Domain zurück", async () => {
    getOrigin.mockRejectedValue(new Error("keine Header"));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.strado.ch");
    const eintraege = await sitemap();
    expect(eintraege[0]?.url).toBe("https://app.strado.ch");
  });
});
