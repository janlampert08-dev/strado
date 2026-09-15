import { describe, expect, it } from "vitest";
import {
  AKTIVITAET_LIMIT,
  aktivitaetsSchluessel,
  mischeAktivitaet,
  type AktivitaetsEintrag,
} from "@/lib/aktivitaet";
import type { ReceivedKudos } from "@/lib/kudos";
import type { ReceivedFollower } from "@/lib/follows";

function kudo(erstelltAm: string, giverId = "g1", completionId = "c1"): ReceivedKudos {
  return {
    completionId,
    giverId,
    giverDisplayName: "Gebende",
    giverAvatarUrl: null,
    giverZeigtPremiumAbzeichen: false,
    erstelltAm,
    neu: false,
  };
}

function follower(erstelltAm: string, followerId = "f1"): ReceivedFollower {
  return {
    followerId,
    followerDisplayName: "Folgende",
    followerAvatarUrl: null,
    followerZeigtPremiumAbzeichen: false,
    erstelltAm,
    neu: true,
  };
}

describe("mischeAktivitaet", () => {
  it("mischt beide Arten in eine Zeitachse, neueste zuerst", () => {
    const eintraege = mischeAktivitaet(
      [kudo("2026-09-10T10:00:00Z"), kudo("2026-09-08T10:00:00Z", "g2", "c2")],
      [follower("2026-09-09T10:00:00Z"), follower("2026-09-07T10:00:00Z", "f2")],
    );

    expect(eintraege.map((e) => [e.art, e.erstelltAm])).toEqual([
      ["kudos", "2026-09-10T10:00:00Z"],
      ["follower", "2026-09-09T10:00:00Z"],
      ["kudos", "2026-09-08T10:00:00Z"],
      ["follower", "2026-09-07T10:00:00Z"],
    ]);
  });

  it("übernimmt Person, Abzeichen und neu-Flag aus der jeweiligen Quelle", () => {
    const [eintrag] = mischeAktivitaet([], [
      {
        ...follower("2026-09-09T10:00:00Z"),
        followerDisplayName: "Anna",
        followerAvatarUrl: "https://example.test/a.jpg",
        followerZeigtPremiumAbzeichen: true,
      },
    ]);

    expect(eintrag).toEqual({
      art: "follower",
      personId: "f1",
      personName: "Anna",
      personAvatarUrl: "https://example.test/a.jpg",
      personZeigtPremiumAbzeichen: true,
      erstelltAm: "2026-09-09T10:00:00Z",
      neu: true,
    });
  });

  it("kappt auf AKTIVITAET_LIMIT und behält dabei die neuesten", () => {
    // Beide Quellen voll ausgeschöpft (je 30, siehe 0057/0097): die
    // gemeinsamen letzten 30 dürfen keinen jüngeren Eintrag verlieren.
    const kudos = Array.from({ length: AKTIVITAET_LIMIT }, (_, i) =>
      kudo(new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(), `g${i}`, `c${i}`),
    );
    const follower_ = Array.from({ length: AKTIVITAET_LIMIT }, (_, i) =>
      follower(new Date(Date.UTC(2026, 8, 2, 0, i)).toISOString(), `f${i}`),
    );

    const eintraege = mischeAktivitaet(kudos, follower_);

    expect(eintraege).toHaveLength(AKTIVITAET_LIMIT);
    // Die Follower sind durchweg jünger — also bleiben genau sie übrig.
    expect(eintraege.every((e) => e.art === "follower")).toBe(true);
    expect(eintraege[0].erstelltAm).toBe(
      new Date(Date.UTC(2026, 8, 2, 0, AKTIVITAET_LIMIT - 1)).toISOString(),
    );
  });

  it("liefert für leere Quellen eine leere Liste", () => {
    expect(mischeAktivitaet([], [])).toEqual([]);
  });
});

describe("aktivitaetsSchluessel", () => {
  it("unterscheidet Kudo und Folgen derselben Person", () => {
    const [kudosEintrag] = mischeAktivitaet([kudo("2026-09-10T10:00:00Z", "p1", "c1")], []);
    const [followerEintrag] = mischeAktivitaet([], [follower("2026-09-10T10:00:00Z", "p1")]);

    expect(aktivitaetsSchluessel(kudosEintrag)).not.toBe(aktivitaetsSchluessel(followerEintrag));
  });

  it("trennt zwei Kudos derselben Person auf verschiedenen Fahrten", () => {
    const eintraege: AktivitaetsEintrag[] = mischeAktivitaet(
      [kudo("2026-09-10T10:00:00Z", "p1", "c1"), kudo("2026-09-09T10:00:00Z", "p1", "c2")],
      [],
    );

    expect(new Set(eintraege.map(aktivitaetsSchluessel)).size).toBe(2);
  });
});
