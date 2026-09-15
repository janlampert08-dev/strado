import { describe, expect, it, vi, beforeEach } from "vitest";

// app/robots.ts zieht die Origin aus den Request-Headern und die
// Staging-Erkennung aus lib/staging.ts. Beides hier ersetzt, damit der Test
// die Regeln prüft und nicht die Umgebung.
const getOrigin = vi.fn<() => Promise<string>>();
vi.mock("@/lib/utils/url", () => ({ getOrigin: () => getOrigin() }));

import robots from "@/app/robots";

describe("app/robots.ts", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    getOrigin.mockResolvedValue("https://app.strado.ch");
  });

  it("gibt die Produktion frei und nennt die Sitemap", async () => {
    const r = await robots();
    expect(r.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toBe("https://app.strado.ch/sitemap.xml");
  });

  // Der Kern dieser Datei: Disallow und noindex schliessen sich aus. Eine
  // Adresse, die per noindex aus dem Index gehalten wird, MUSS abrufbar
  // bleiben — sonst findet der Crawler das noindex nie und führt die URL
  // weiterhin, nur ohne Inhalt.
  //
  // Die vier Pfade unten tragen NICHT_INDEXIEREN bzw. robots.index: false
  // auf der Seite selbst. Landet einer von ihnen (wieder) in der
  // Disallow-Liste, ist seine noindex-Angabe wirkungslos.
  it.each([
    ["/anmelden", "app/anmelden/page.tsx"],
    ["/anmelden/passwort-vergessen", "app/anmelden/passwort-vergessen/page.tsx"],
    ["/registrieren", "app/registrieren/page.tsx"],
    ["/fahrer", "app/fahrer/[id]/page.tsx"],
  ])("sperrt %s nicht — die Seite hält sich per noindex heraus (%s)", async (pfad) => {
    const r = await robots();
    const disallow = [(r.rules as { disallow?: string | string[] }).disallow ?? []].flat();
    expect(disallow).not.toContain(pfad);
    // Auch kein Präfix darf greifen: "/anmelden" würde
    // "/anmelden/passwort-vergessen" mitsperren.
    expect(disallow.some((d) => pfad.startsWith(d))).toBe(false);
  });

  // Umgekehrt: diese bleiben gesperrt. Sie werden nur aus angemeldeten
  // Oberflächen heraus verlinkt, und /api geht es um Last statt um den Index.
  it.each(["/profil", "/moderation", "/api", "/aktivitaet"])(
    "sperrt %s weiterhin",
    async (pfad) => {
      const r = await robots();
      const disallow = [(r.rules as { disallow?: string | string[] }).disallow ?? []].flat();
      expect(disallow).toContain(pfad);
    },
  );

  // Staging trägt denselben Inhalt wie die Produktion und darf deshalb gar
  // nicht erst gecrawlt werden — dort ist Disallow das richtige Werkzeug,
  // weil es um die ganze Umgebung geht und nicht um einzelne Adressen.
  it("verbietet auf Staging alles und nennt keine Sitemap", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "staging");
    getOrigin.mockResolvedValue("https://staging.strado.ch");
    const r = await robots();
    expect(r.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(r.sitemap).toBeUndefined();
  });
});
