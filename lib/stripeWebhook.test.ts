import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  ANSPRUCH_VERFAELLT_NACH_MS,
  ereignisBeanspruchen,
  kulanzAktionFuer,
  leseAboIdAusRechnung,
  leseAboZustand,
  bekanntePreisIds,
  preisHerkunft,
} from "@/lib/stripeWebhook";

// Minimaler Mock für genau die Teile der Supabase-Query-Builder-API, die
// ereignisBeanspruchen benutzt: insert, select().eq().maybeSingle() und
// update().eq().eq(). Protokolliert die Aufrufe, damit die Tests auch prüfen
// können, WAS geschrieben wurde, nicht nur was zurückkam.
function makeMockSupabase(optionen: {
  insertError?: { code?: string } | null;
  vorhandeneZeile?: { status: string; received_at: string } | null;
  // Was das bedingte Übernahme-UPDATE zurückgibt: eine leere Liste steht für
  // "ein anderer Aufruf war schneller".
  uebernahmeTreffer?: { id: string }[];
}) {
  const aufrufe: { art: string; werte?: unknown }[] = [];

  const supabase = {
    from: () => ({
      insert: async (werte: unknown) => {
        aufrufe.push({ art: "insert", werte });
        return { error: optionen.insertError ?? null };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: optionen.vorhandeneZeile ?? null, error: null }),
        }),
      }),
      update: (werte: unknown) => {
        aufrufe.push({ art: "update", werte });
        return {
          eq: () => ({
            eq: () => ({
              lt: () => ({
                select: async () => ({
                  data: optionen.uebernahmeTreffer ?? [{ id: "evt_1" }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    }),
  } as unknown as Parameters<typeof ereignisBeanspruchen>[0];

  return { supabase, aufrufe };
}

function abo(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [{ price: { id: "price_monat" }, current_period_end: 1_800_000_000 }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("leseAboZustand", () => {
  it("liest Periodenende und Preis aus der Abo-Position statt aus dem Abo", () => {
    // Seit API-Version 2025-03-31.basil hängen beide Werte an der Position.
    // Läge die Lesestelle wieder am Abo, wäre das Ergebnis stillschweigend
    // null/undefined statt eines Fehlers — deshalb dieser Test.
    const zustand = leseAboZustand(abo());
    expect(zustand).toEqual({
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
      status: "active",
      priceId: "price_monat",
      currentPeriodEnd: new Date(1_800_000_000 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
    });
  });

  it("nimmt die Customer-ID auch aus einem ausgeklappten Customer-Objekt", () => {
    const zustand = leseAboZustand(abo({ customer: { id: "cus_2" } as Stripe.Customer }));
    expect(zustand?.stripeCustomerId).toBe("cus_2");
  });

  it("liefert null statt zu werfen, wenn der Preis fehlt", () => {
    expect(leseAboZustand(abo({ items: { data: [] } } as unknown as Stripe.Subscription))).toBeNull();
  });

  it("liefert null, wenn kein Customer am Abo hängt", () => {
    expect(leseAboZustand(abo({ customer: null } as unknown as Stripe.Subscription))).toBeNull();
  });

  it("verträgt ein fehlendes Periodenende, ohne den Rest zu verlieren", () => {
    const ohneEnde = abo({
      items: { data: [{ price: { id: "price_jahr" } }] },
    } as unknown as Stripe.Subscription);
    expect(leseAboZustand(ohneEnde)).toMatchObject({
      priceId: "price_jahr",
      currentPeriodEnd: null,
    });
  });
});

describe("leseAboIdAusRechnung", () => {
  it("findet die Abo-ID unter parent.subscription_details", () => {
    const rechnung = {
      id: "in_1",
      parent: { subscription_details: { subscription: "sub_9" } },
    } as unknown as Stripe.Invoice;
    expect(leseAboIdAusRechnung(rechnung)).toBe("sub_9");
  });

  it("liefert null für eine Rechnung ohne Abo (einmalige Zahlung)", () => {
    expect(leseAboIdAusRechnung({ id: "in_2", parent: null } as unknown as Stripe.Invoice)).toBeNull();
  });
});

describe("kulanzAktionFuer", () => {
  it("lässt die Frist bei gewöhnlichen Abo-Ereignissen unberührt", () => {
    expect(kulanzAktionFuer("customer.subscription.updated")).toBe("unveraendert");
    expect(kulanzAktionFuer("customer.subscription.deleted")).toBe("unveraendert");
  });

  it("startet die Frist bei fehlgeschlagener Zahlung und beendet sie bei bezahlter", () => {
    expect(kulanzAktionFuer("invoice.payment_failed")).toBe("setzen");
    expect(kulanzAktionFuer("invoice.paid")).toBe("loeschen");
  });

  it("ignoriert Ereignisse ohne Bezug zum Premium-Status", () => {
    expect(kulanzAktionFuer("customer.updated")).toBeNull();
    expect(kulanzAktionFuer("payment_intent.succeeded")).toBeNull();
  });
});

describe("ereignisBeanspruchen", () => {
  it("übernimmt ein neues Ereignis und markiert es als in Arbeit, nicht als erledigt", async () => {
    // Der Kern der Zweiphasigkeit: würde hier schon 'erledigt' stehen, wäre
    // jede Wiederholung nach einem gescheiterten Seiteneffekt verloren.
    const { supabase, aufrufe } = makeMockSupabase({});
    expect(await ereignisBeanspruchen(supabase, "evt_1", "invoice.paid")).toEqual({
      art: "uebernommen",
    });
    expect(aufrufe[0].werte).toMatchObject({ id: "evt_1", status: "in_arbeit" });
  });

  it("erkennt eine erneute Zustellung eines abgeschlossenen Ereignisses", async () => {
    const { supabase } = makeMockSupabase({
      insertError: { code: "23505" },
      vorhandeneZeile: { status: "erledigt", received_at: new Date().toISOString() },
    });
    expect(await ereignisBeanspruchen(supabase, "evt_1", "invoice.paid")).toEqual({ art: "erledigt" });
  });

  it("verarbeitet nicht doppelt, solange ein anderer Aufruf frisch daran arbeitet", async () => {
    const { supabase } = makeMockSupabase({
      insertError: { code: "23505" },
      vorhandeneZeile: { status: "in_arbeit", received_at: new Date().toISOString() },
    });
    expect(await ereignisBeanspruchen(supabase, "evt_1", "invoice.paid")).toEqual({
      art: "in_arbeit",
    });
  });

  it("übernimmt einen verwaisten Anspruch, damit ein abgestürzter Aufruf das Ereignis nicht dauerhaft blockiert", async () => {
    const veraltet = new Date(Date.now() - ANSPRUCH_VERFAELLT_NACH_MS - 1_000).toISOString();
    const { supabase } = makeMockSupabase({
      insertError: { code: "23505" },
      vorhandeneZeile: { status: "in_arbeit", received_at: veraltet },
    });
    expect(await ereignisBeanspruchen(supabase, "evt_1", "invoice.paid")).toEqual({
      art: "uebernommen",
    });
  });

  it("überlässt einen verfallenen Anspruch dem Aufruf, der ihn zuerst übernimmt", async () => {
    // Zwei Aufrufe können gleichzeitig feststellen, dass derselbe Anspruch
    // verfallen ist. Das bedingte UPDATE trifft dann nur bei einem von
    // beiden eine Zeile — der andere darf nicht ebenfalls verarbeiten.
    const veraltet = new Date(Date.now() - ANSPRUCH_VERFAELLT_NACH_MS - 1_000).toISOString();
    const { supabase } = makeMockSupabase({
      insertError: { code: "23505" },
      vorhandeneZeile: { status: "in_arbeit", received_at: veraltet },
      uebernahmeTreffer: [],
    });
    expect(await ereignisBeanspruchen(supabase, "evt_1", "invoice.paid")).toEqual({
      art: "in_arbeit",
    });
  });

  it("wirft bei einem anderen Datenbankfehler weiter, statt ihn als Duplikat zu behandeln", async () => {
    const { supabase } = makeMockSupabase({ insertError: { code: "57014" } });
    await expect(ereignisBeanspruchen(supabase, "evt_1", "invoice.paid")).rejects.toEqual({
      code: "57014",
    });
  });
});


// Die Preis-Schranke aus Audit-Befund A5: der Webhook-Endpunkt hängt am
// Stripe-KONTO, nicht am Produkt, und vergab Premium bisher für jedes Abo,
// das dort auflief.
describe("preisHerkunft", () => {
  const PREIS_VARIABLEN = [
    "STRIPE_PREMIUM_PRICE_ID_MONAT",
    "STRIPE_PREMIUM_PRICE_ID_JAHR",
    "STRIPE_PREMIUM_PRICE_ID_GRUENDER",
    "STRIPE_PREMIUM_PRICE_ID",
  ] as const;

  let gesichert: Record<string, string | undefined>;

  beforeEach(() => {
    gesichert = Object.fromEntries(PREIS_VARIABLEN.map((n) => [n, process.env[n]]));
    for (const name of PREIS_VARIABLEN) delete process.env[name];
  });

  afterEach(() => {
    for (const name of PREIS_VARIABLEN) {
      const wert = gesichert[name];
      if (wert === undefined) delete process.env[name];
      else process.env[name] = wert;
    }
  });

  it("erkennt eine konfigurierte Preis-ID als eigenes Premium", () => {
    process.env.STRIPE_PREMIUM_PRICE_ID_MONAT = "price_monat";
    expect(preisHerkunft("price_monat")).toBe("premium");
  });

  it("zählt den Gründerpreis weiter mit, obwohl er nicht mehr verkauft wird", () => {
    process.env.STRIPE_PREMIUM_PRICE_ID_GRUENDER = "price_gruender";
    expect(preisHerkunft("price_gruender")).toBe("premium");
  });

  it("erkennt die Alt-Variable ohne Monat/Jahr-Suffix", () => {
    process.env.STRIPE_PREMIUM_PRICE_ID = "price_alt";
    expect(preisHerkunft("price_alt")).toBe("premium");
  });

  it("weist ein fremdes Produkt auf demselben Konto ab", () => {
    process.env.STRIPE_PREMIUM_PRICE_ID_MONAT = "price_monat";
    expect(preisHerkunft("price_etwas_anderes")).toBe("fremd");
  });

  // Der wichtige Unterschied: ohne jede konfigurierte Variable ist "fremd"
  // die falsche Antwort. Dann lässt sich eigen und fremd nicht
  // unterscheiden, und das gehört gemeldet statt weggefiltert.
  it("meldet fehlende Konfiguration, statt alles als fremd abzutun", () => {
    expect(preisHerkunft("price_irgendwas")).toBe("unkonfiguriert");
  });

  it("sammelt alle gesetzten Varianten ohne Dubletten", () => {
    process.env.STRIPE_PREMIUM_PRICE_ID_MONAT = "price_a";
    process.env.STRIPE_PREMIUM_PRICE_ID = "price_a";
    process.env.STRIPE_PREMIUM_PRICE_ID_JAHR = "price_b";
    expect(bekanntePreisIds().sort()).toEqual(["price_a", "price_b"]);
  });

  it("ignoriert eine leer gesetzte Variable", () => {
    process.env.STRIPE_PREMIUM_PRICE_ID_MONAT = "   ";
    expect(bekanntePreisIds()).toEqual([]);
    expect(preisHerkunft("price_x")).toBe("unkonfiguriert");
  });
});
