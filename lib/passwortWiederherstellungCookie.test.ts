import { beforeEach, describe, expect, it, vi } from "vitest";

// next/headers ist ausserhalb einer Anfrage nicht aufrufbar. Ein Doppel des
// Cookie-Stores reicht: geprüft wird, WAS die drei Wrapper damit tun.
const store = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: async () => store,
}));

const {
  WIEDERHERSTELLUNGS_COOKIE,
  WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN,
  istWiederherstellung,
  merkeWiederherstellung,
  verbraucheWiederherstellung,
} = await import("@/lib/passwortWiederherstellung");

const NUTZER = "9e5867c8-03a0-472f-8274-ba26deaf2743";

beforeEach(() => {
  store.set.mockReset();
  store.get.mockReset();
  store.delete.mockReset();
});

describe("merkeWiederherstellung", () => {
  it("legt das Merkmal unter der Nutzer-ID ab", async () => {
    await merkeWiederherstellung(NUTZER);
    const [name, wert] = store.set.mock.calls[0];
    expect(name).toBe(WIEDERHERSTELLUNGS_COOKIE);
    expect(wert).toBe(NUTZER);
  });

  // Das Cookie berechtigt dazu, das alte Passwort wegzulassen. Wäre es aus
  // dem Browser-JS lesbar oder schreibbar, wäre genau das die Lücke.
  it("setzt es httpOnly, sameSite lax, mit Pfad und kurzer Laufzeit", async () => {
    await merkeWiederherstellung(NUTZER);
    expect(store.set.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: WIEDERHERSTELLUNG_GUELTIG_SEKUNDEN,
    });
  });

  // secure:true auf http://localhost käme nie an — dort bricht sonst das
  // Zurücksetzen in der Entwicklung, ohne dass es jemandem auffiele.
  it("setzt secure nur in Produktion", async () => {
    const vorher = process.env.NODE_ENV;
    try {
      vi.stubEnv("NODE_ENV", "production");
      await merkeWiederherstellung(NUTZER);
      expect(store.set.mock.calls[0][2]).toMatchObject({ secure: true });

      store.set.mockReset();
      vi.stubEnv("NODE_ENV", "development");
      await merkeWiederherstellung(NUTZER);
      expect(store.set.mock.calls[0][2]).toMatchObject({ secure: false });
    } finally {
      vi.unstubAllEnvs();
      expect(process.env.NODE_ENV).toBe(vorher);
    }
  });
});

describe("istWiederherstellung", () => {
  it("gilt für die Sitzung, für die das Merkmal gesetzt wurde", async () => {
    store.get.mockReturnValue({ value: NUTZER });
    await expect(istWiederherstellung(NUTZER)).resolves.toBe(true);
    expect(store.get).toHaveBeenCalledWith(WIEDERHERSTELLUNGS_COOKIE);
  });

  it("gilt NICHT für ein anderes Konto auf demselben Gerät", async () => {
    store.get.mockReturnValue({ value: NUTZER });
    await expect(istWiederherstellung("ce4f33eb-ece2-40f4-8b1c-da26d1bb6f5a")).resolves.toBe(false);
  });

  // Der Normalfall: Passwortwechsel aus den Einstellungen heraus. Dort MUSS
  // das alte Passwort verlangt werden.
  it("gilt nicht ohne Cookie", async () => {
    store.get.mockReturnValue(undefined);
    await expect(istWiederherstellung(NUTZER)).resolves.toBe(false);
  });
});

describe("verbraucheWiederherstellung", () => {
  it("entfernt das Merkmal, damit es keinen zweiten Wechsel deckt", async () => {
    await verbraucheWiederherstellung();
    expect(store.delete).toHaveBeenCalledWith(WIEDERHERSTELLUNGS_COOKIE);
  });
});
