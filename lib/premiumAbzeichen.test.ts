import { beforeEach, describe, expect, it, vi } from "vitest";

// Der einzige Weg, dieses Modul zu prüfen: es besteht aus einer Abfrage, und
// was geprüft werden soll, ist nicht die Abfrage selbst, sondern wie das
// Modul auf ihre Antworten reagiert — vor allem auf die ausbleibende.
//
// vi.mock ist im Repo etabliert (lib/geocoding.test.ts stubbt fetch,
// lib/passwortWiederherstellungCookie.test.ts die Cookies); der
// Supabase-Client war bisher nur nirgends nötig. Die Kette ist kurz genug,
// um sie von Hand nachzubauen: from → select → in → eq, und erst das eq am
// Ende wird erwartet.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getPremiumAbzeichen, hatPremiumAbzeichen } from "@/lib/premiumAbzeichen";

const createClientMock = vi.mocked(createClient);

function mockAntwort(antwort: { data: unknown }) {
  const eq = vi.fn().mockResolvedValue(antwort);
  const inFn = vi.fn(() => ({ eq }));
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));
  // Der echte Client hat deutlich mehr Oberfläche; geprüft wird nur der eine
  // Pfad, den dieses Modul benutzt.
  createClientMock.mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>);
  return { from, select, in: inFn, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPremiumAbzeichen", () => {
  // Der wichtigste Fall, und der Grund, warum es diese Datei gibt: Eine
  // fehlende Antwort darf NIE zu einem gesetzten Abzeichen führen.
  //
  // Das Modul liest bewusst nur `data` und wertet `error` nicht aus — fällt
  // die Abfrage aus (etwa weil 0087 noch nicht eingespielt ist), kommt data
  // als null zurück und die Seite rendert ohne Abzeichen, statt zu
  // scheitern. Genau diese Eigenschaft steht in
  // supabase/migrations/README.md und in AGENTS.md als Begründung dafür,
  // dass Feed und Fahrt-Detail die Migration überleben. Wer hier später ein
  // throwOnQueryError einzieht, ändert diese zugesicherte Eigenschaft und
  // soll darüber stolpern.
  it("liefert bei ausbleibender Antwort niemanden zurück, statt zu werfen", async () => {
    mockAntwort({ data: null });
    await expect(getPremiumAbzeichen(["u1", "u2"])).resolves.toEqual(new Set());
  });

  it("nimmt nur auf, was die Datenbank zurückgibt", async () => {
    mockAntwort({ data: [{ id: "u1" }] });
    const ergebnis = await getPremiumAbzeichen(["u1", "u2"]);
    expect(ergebnis.has("u1")).toBe(true);
    // u2 wurde gefragt, kam aber nicht zurück — kein Abzeichen.
    expect(ergebnis.has("u2")).toBe(false);
  });

  // Der Feed schickt eine Zeile pro Fahrt, nicht pro Konto: wer an einem Tag
  // dreimal gefahren ist, stünde sonst dreimal in der IN-Liste.
  it("fragt jede Kennung nur einmal ab", async () => {
    const { in: inFn } = mockAntwort({ data: [] });
    await getPremiumAbzeichen(["u1", "u1", "u2", "u1"]);
    expect(inFn).toHaveBeenCalledWith("id", ["u1", "u2"]);
  });

  // Eine leere Liste ist der Normalfall auf einem leeren Feed. Dafür darf
  // keine Verbindung aufgemacht werden.
  it("fragt bei leerer Liste gar nicht erst", async () => {
    mockAntwort({ data: [] });
    await expect(getPremiumAbzeichen([])).resolves.toEqual(new Set());
    expect(createClientMock).not.toHaveBeenCalled();
  });

  // Die Verknüpfung (ist_premium UND Opt-in) fällt in der generierten Spalte
  // aus 0087, nicht hier. Diese Erwartung hält fest, dass das Modul die
  // fertige Spalte liest und nicht etwa den rohen Abo-Status — läse es
  // ist_premium, stünde der Abo-Status wieder in einer Abfrage, die ihn
  // nicht braucht.
  it("liest die generierte Spalte, nicht den rohen Abo-Status", async () => {
    const { select, eq } = mockAntwort({ data: [] });
    await getPremiumAbzeichen(["u1"]);
    expect(select).toHaveBeenCalledWith("id, zeigt_premium_abzeichen");
    expect(eq).toHaveBeenCalledWith("zeigt_premium_abzeichen", true);
  });
});

describe("hatPremiumAbzeichen", () => {
  it("ist ohne Kennung false und fragt nicht ab", async () => {
    mockAntwort({ data: [] });
    await expect(hatPremiumAbzeichen(null)).resolves.toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("spiegelt die Antwort für die eine Kennung", async () => {
    mockAntwort({ data: [{ id: "u1" }] });
    await expect(hatPremiumAbzeichen("u1")).resolves.toBe(true);

    mockAntwort({ data: [] });
    await expect(hatPremiumAbzeichen("u1")).resolves.toBe(false);
  });
});
