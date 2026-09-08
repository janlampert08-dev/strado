import { describe, expect, it } from "vitest";
import {
  type AvatarSpeicher,
  avatarObjekteAuflisten,
  avatareEntfernen,
} from "@/lib/avatarSpeicher";

const NUTZER = "9e5867c8-03a0-472f-8274-ba26deaf2743";

interface Eintrag {
  name: string;
  id?: string | null;
}

/** Testdoppel des Storage-Ordners: hält Einträge, protokolliert Löschungen. */
function speicher(
  eintraege: Eintrag[],
  fehler: { list?: string; remove?: string } = {},
): AvatarSpeicher & { geloescht: string[][]; listAufrufe: number } {
  const geloescht: string[][] = [];
  let listAufrufe = 0;

  return {
    geloescht,
    get listAufrufe() {
      return listAufrufe;
    },
    async list(pfad, { limit, offset }) {
      listAufrufe += 1;
      if (fehler.list) return { data: null, error: { message: fehler.list } };
      expect(pfad).toBe(NUTZER);
      return { data: eintraege.slice(offset, offset + limit), error: null };
    },
    async remove(pfade) {
      if (fehler.remove) return { error: { message: fehler.remove } };
      geloescht.push(pfade);
      return { error: null };
    },
  };
}

describe("avatarObjekteAuflisten", () => {
  it("qualifiziert die Namen mit dem Nutzerordner", async () => {
    const s = speicher([{ name: "avatar.jpg", id: "1" }]);
    expect(await avatarObjekteAuflisten(s, NUTZER)).toEqual({
      pfade: [`${NUTZER}/avatar.jpg`],
      fehler: null,
    });
  });

  it("überspringt Unterordner (id fehlt)", async () => {
    const s = speicher([
      { name: "unterordner", id: null },
      { name: "avatar.png", id: "1" },
      { name: "ohne-id-feld" },
    ]);
    const { pfade } = await avatarObjekteAuflisten(s, NUTZER);
    expect(pfade).toEqual([`${NUTZER}/avatar.png`]);
  });

  it("blättert über die Seitengrenze hinweg", async () => {
    const viele = Array.from({ length: 150 }, (_, i) => ({ name: `d${i}.jpg`, id: String(i) }));
    const s = speicher(viele);
    const { pfade } = await avatarObjekteAuflisten(s, NUTZER);
    expect(pfade).toHaveLength(150);
    expect(s.listAufrufe).toBe(2);
  });

  it("meldet einen Lesefehler, statt eine leere Liste vorzutäuschen", async () => {
    const s = speicher([], { list: "kaputt" });
    expect(await avatarObjekteAuflisten(s, NUTZER)).toEqual({ pfade: [], fehler: "kaputt" });
  });
});

describe("avatareEntfernen", () => {
  // Der Fall, an dem BILD_ENDUNGEN vorbeigriff und der in Produktion
  // nachgewiesen ist: eine Endung, die bildEndungFuerMime() nie vergibt.
  it("erwischt Altbestands-Endungen wie .jpeg und .JPG", async () => {
    const s = speicher([
      { name: "avatar.jpeg", id: "1" },
      { name: "avatar.JPG", id: "2" },
    ]);
    const { entfernt, fehler } = await avatareEntfernen(s, NUTZER);
    expect(fehler).toBeNull();
    expect(entfernt).toEqual([`${NUTZER}/avatar.jpeg`, `${NUTZER}/avatar.JPG`]);
    expect(s.geloescht).toEqual([[`${NUTZER}/avatar.jpeg`, `${NUTZER}/avatar.JPG`]]);
  });

  it("lässt das gerade hochgeladene Bild stehen", async () => {
    const neu = `${NUTZER}/avatar.jpg`;
    const s = speicher([
      { name: "avatar.jpg", id: "1" },
      { name: "avatar.jpeg", id: "2" },
    ]);
    const { entfernt } = await avatareEntfernen(s, NUTZER, neu);
    expect(entfernt).toEqual([`${NUTZER}/avatar.jpeg`]);
    expect(entfernt).not.toContain(neu);
  });

  it("räumt bei der Kontolöschung den ganzen Ordner ab", async () => {
    const s = speicher([
      { name: "avatar.jpg", id: "1" },
      { name: "avatar.webp", id: "2" },
    ]);
    const { entfernt } = await avatareEntfernen(s, NUTZER, null);
    expect(entfernt).toHaveLength(2);
  });

  it("schickt keinen Request, wenn nichts zu löschen ist", async () => {
    const s = speicher([]);
    expect(await avatareEntfernen(s, NUTZER)).toEqual({ entfernt: [], fehler: null });
    expect(s.geloescht).toEqual([]);
  });

  it("löscht nichts, wenn das Auflisten fehlschlägt", async () => {
    const s = speicher([{ name: "avatar.jpg", id: "1" }], { list: "kein Zugriff" });
    const { entfernt, fehler } = await avatareEntfernen(s, NUTZER);
    expect(fehler).toBe("kein Zugriff");
    expect(entfernt).toEqual([]);
    expect(s.geloescht).toEqual([]);
  });

  it("reicht einen Löschfehler durch, statt Erfolg zu melden", async () => {
    const s = speicher([{ name: "avatar.jpg", id: "1" }], { remove: "verweigert" });
    expect((await avatareEntfernen(s, NUTZER)).fehler).toBe("verweigert");
  });
});
