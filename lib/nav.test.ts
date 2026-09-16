import { describe, it, expect } from "vitest";
import { getNavItems, getRollenItems } from "@/lib/nav";

function hrefs(items: { href: string }[]): string[] {
  return items.map((item) => item.href);
}

describe("getNavItems", () => {
  // Alles, was ohne Konto benutzbar ist, steht auch für Abgemeldete in der
  // Navigation: Strecken, Feed und Ranglisten sind öffentlich lesbar, und
  // aufzeichnen darf inzwischen jeder (das Konto verlangt erst das
  // Speichern, siehe FreeRideForm.tsx).
  //
  // /aktivitaet steht nicht dabei und darf es nicht: ohne Konto gibt es
  // weder eigene Fahrten noch Follower, die Seite leitet auf /anmelden um.
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

  // Die Zuordnung, die der Kopf von lib/nav.ts begründet, festgehalten:
  // die Ranglisten sind ein eigener Bereich und stehen in der Leiste, die
  // Aktivität ist eine Ansicht auf dieselbe Frage wie der Feed und steht
  // dort als Reiter (components/FeedReiter.tsx).
  it("trägt die Ranglisten und nicht die Aktivität", () => {
    for (const surface of ["header", "bottom"] as const) {
      const items = hrefs(getNavItems({ loggedIn: true, moderator: false, surface }));
      expect(items).toContain("/leaderboards");
      expect(items).not.toContain("/aktivitaet");
    }
  });

  // Die Gegenrechnung, und der Grund, warum NavItem.aktivAuf existiert:
  // BottomNav markiert einen Eintrag über pathname.startsWith(href).
  // /aktivitaet hat keinen eigenen Eintrag mehr und ist auch kein Präfix
  // eines verbliebenen — wer im Feed "Aktivität" tippt, stünde sonst auf
  // einer Seite, auf der unten NICHTS hervorgehoben ist. Auf dem Telefon
  // ist die Leiste der einzige Orientierungsanker.
  //
  // Der Test prüft beides zusammen: dass genau ein Eintrag /aktivitaet
  // abdeckt, und dass es der Feed ist — die Seite, auf der die Aktivität
  // als Reiter sitzt.
  it("markiert /aktivitaet über den Feed-Eintrag", () => {
    const items = getNavItems({ loggedIn: true, moderator: false, surface: "bottom" });
    const zustaendig = items.filter((i) =>
      (i.aktivAuf ?? []).some((p) => "/aktivitaet".startsWith(p)),
    );
    expect(zustaendig.map((i) => i.href)).toEqual(["/feed"]);
  });

  // Die Ranglisten brauchen umgekehrt KEIN aktivAuf: sie sind wieder ein
  // eigener Eintrag, also deckt sie ihr eigenes Präfix ab. Ein zusätzlicher
  // Eintrag, der /leaderboards mitmarkiert, würde auf der Ranglisten-Seite
  // zwei Tabs gleichzeitig hervorheben.
  it("markiert /leaderboards über genau einen Eintrag", () => {
    for (const loggedIn of [false, true]) {
      for (const surface of ["header", "bottom"] as const) {
        const items = getNavItems({ loggedIn, moderator: false, surface });
        const zustaendig = items.filter(
          (i) =>
            (i.href !== "/" && "/leaderboards".startsWith(i.href)) ||
            (i.aktivAuf ?? []).some((p) => "/leaderboards".startsWith(p)),
        );
        expect(zustaendig.map((i) => i.href)).toEqual(["/leaderboards"]);
      }
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

  it("hängt Moderation im Header nur für Moderatoren an", () => {
    expect(
      hrefs(getNavItems({ loggedIn: true, moderator: true, surface: "header" })),
    ).toContain("/moderation");
    expect(
      hrefs(getNavItems({ loggedIn: true, moderator: false, surface: "header" })),
    ).not.toContain("/moderation");
  });

  // Der Kern der Deckelung: die mobile Leiste ist für JEDES Konto fünf
  // Einträge breit — auch für eines, das Moderator UND Creator ist. Vorher
  // waren das sieben Spalten auf 360 px.
  it("bleibt in der mobilen Leiste bei fünf Einträgen, egal welche Rollen", () => {
    for (const rollen of [
      { moderator: false, creator: false },
      { moderator: true, creator: false },
      { moderator: false, creator: true },
      { moderator: true, creator: true },
    ]) {
      const items = getNavItems({ loggedIn: true, ...rollen, surface: "bottom" });
      expect(hrefs(items)).toEqual(["/", "/feed", "/fahrten/neu", "/leaderboards", "/profil"]);
    }
  });

  it("hält Fahrt starten in der mobilen Leiste an der mittleren Position", () => {
    const items = getNavItems({ loggedIn: true, moderator: true, surface: "bottom" });
    expect(items).toHaveLength(5);
    expect(items[2].href).toBe("/fahrten/neu");
  });

  // Creator-Konten (0091): der Eintrag steht im Header. Auf dem Telefon
  // führt der Weg über /profil (siehe getRollenItems) — die Leiste dort
  // bleibt bei fünf Einträgen.
  it("hängt Creator im Header nur für Creator an", () => {
    expect(
      hrefs(getNavItems({ loggedIn: true, moderator: false, creator: true, surface: "header" })),
    ).toContain("/creator");
    expect(
      hrefs(getNavItems({ loggedIn: true, moderator: false, creator: false, surface: "header" })),
    ).not.toContain("/creator");
  });

  // Der Parameter ist optional, weil er für fast jedes Konto falsch ist —
  // ein weggelassener darf keinen Eintrag erzeugen.
  it("zeigt Creator nicht, wenn der Parameter fehlt", () => {
    expect(hrefs(getNavItems({ loggedIn: true, moderator: true }))).not.toContain("/creator");
  });

  // Zahlen sieht nur, wer ein Konto hat — ohne Anmeldung gibt es keine
  // Zuweisung, die der Eintrag meinen könnte.
  it("zeigt Creator nie für Abgemeldete", () => {
    for (const surface of ["header", "bottom"] as const) {
      expect(
        hrefs(getNavItems({ loggedIn: false, moderator: false, creator: true, surface })),
      ).not.toContain("/creator");
    }
  });

  // Was die mobile Leiste nicht mehr trägt, muss auf /profil ankommen —
  // sonst hätte ein Moderator auf dem Telefon gar keinen Weg mehr dorthin.
  it("liefert genau die Rollen-Einträge, die der mobilen Leiste fehlen", () => {
    expect(hrefs(getRollenItems({ moderator: false, creator: false }))).toEqual([]);
    expect(hrefs(getRollenItems({ moderator: true, creator: false }))).toEqual(["/moderation"]);
    expect(hrefs(getRollenItems({ moderator: false, creator: true }))).toEqual(["/creator"]);
    expect(hrefs(getRollenItems({ moderator: true, creator: true }))).toEqual([
      "/creator",
      "/moderation",
    ]);
  });

  // Moderation und Creator sind zwei verschiedene Dinge: ein Moderator sieht
  // die Zahlen aller Codes in der Moderationsansicht, /creator gehört dem,
  // auf den ein Code läuft.
  it("hält Creator und Moderation auseinander", () => {
    const items = hrefs(getNavItems({ loggedIn: true, moderator: true, creator: true }));
    expect(items).toContain("/creator");
    expect(items).toContain("/moderation");
    expect(items.indexOf("/creator")).toBeLessThan(items.indexOf("/moderation"));
  });
});
