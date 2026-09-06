import { describe, it, expect } from "vitest";
import { getNavItems } from "@/lib/nav";

function hrefs(items: { href: string }[]): string[] {
  return items.map((item) => item.href);
}

describe("getNavItems", () => {
  // Alles, was ohne Konto benutzbar ist, steht auch für Abgemeldete in der
  // Navigation: Strecken, Feed und Bestenlisten sind öffentlich lesbar, und
  // aufzeichnen darf inzwischen jeder (das Konto verlangt erst das
  // Speichern, siehe FreeRideForm.tsx). Vorher fehlten Feed und
  // Bestenlisten hier, obwohl beide Seiten längst ohne Session
  // funktionierten — erreichbar nur über einen geteilten Link.
  it("zeigt abgemeldeten Besuchern alles ohne Konto Nutzbare", () => {
    for (const surface of ["header", "bottom"] as const) {
      expect(hrefs(getNavItems({ loggedIn: false, moderator: false, surface }))).toEqual([
        "/",
        "/feed",
        "/fahrten/neu",
        "/leaderboards",
        "/anmelden",
      ]);
    }
  });

  // Der Gegentest zum obigen: was ohne Konto nur eine Umleitung auf
  // /anmelden wäre, hat in der abgemeldeten Navigation nichts verloren.
  it("führt für Abgemeldete weder Vorschlagen noch Profil noch Moderation", () => {
    for (const surface of ["header", "bottom"] as const) {
      const items = hrefs(getNavItems({ loggedIn: false, moderator: true, surface }));
      expect(items).not.toContain("/strecken/neu");
      expect(items).not.toContain("/profil");
      expect(items).not.toContain("/moderation");
    }
  });

  // Der Einstieg heisst nach der Absicht, nicht nach der Mechanik — in jedem
  // Surface und in beiden Anmeldezuständen derselbe Text.
  it("beschriftet den Fahrt-Einstieg überall mit \"Fahrt starten\"", () => {
    for (const loggedIn of [false, true]) {
      for (const surface of ["header", "bottom"] as const) {
        const item = getNavItems({ loggedIn, moderator: false, surface }).find(
          (i) => i.href === "/fahrten/neu",
        );
        expect(item?.label).toBe("Fahrt starten");
      }
    }
  });

  // Der Header ist eine Textleiste mit horizontalem Überlauf — dort passen
  // beide Aktionen nebeneinander. Genau das war der Fehler, den diese Tests
  // absichern: der Fahrt-Einstieg existierte nur in der mobilen Leiste, auf
  // dem Desktop gab es keinen Weg zur freien Fahrt.
  it("führt im Header sowohl Fahrt starten als auch Vorschlagen", () => {
    const items = hrefs(getNavItems({ loggedIn: true, moderator: false, surface: "header" }));
    expect(items).toContain("/fahrten/neu");
    expect(items).toContain("/strecken/neu");
  });

  it("nutzt den Header als Standard-Surface", () => {
    expect(getNavItems({ loggedIn: true, moderator: false })).toEqual(
      getNavItems({ loggedIn: true, moderator: false, surface: "header" }),
    );
  });

  // Sechs Tabs wären auf schmalen Geräten zu eng; der Streckenvorschlag
  // steht dort stattdessen prominent auf /profil.
  it("lässt in der mobilen Leiste Vorschlagen weg und zeigt nur Fahrt starten", () => {
    const items = hrefs(getNavItems({ loggedIn: true, moderator: false, surface: "bottom" }));
    expect(items).toEqual(["/", "/feed", "/fahrten/neu", "/leaderboards", "/profil"]);
  });

  it("hängt Moderation nur für Moderatoren an, in beiden Surfaces", () => {
    for (const surface of ["header", "bottom"] as const) {
      expect(hrefs(getNavItems({ loggedIn: true, moderator: true, surface }))).toContain(
        "/moderation",
      );
      expect(hrefs(getNavItems({ loggedIn: true, moderator: false, surface }))).not.toContain(
        "/moderation",
      );
    }
  });

  it("hält Fahrt starten in der mobilen Leiste an der mittleren Position", () => {
    const items = getNavItems({ loggedIn: true, moderator: true, surface: "bottom" });
    expect(items).toHaveLength(6);
    expect(items[2].href).toBe("/fahrten/neu");
  });
});
