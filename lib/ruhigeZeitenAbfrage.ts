// Die Abfrage zu lib/ruhigeZeiten.ts.
//
// Getrennt von den reinen Funktionen, weil components/RuhigeZeiten.tsx deren
// Typen mitbenutzt und ein Wertimport aus einem Modul, das den Server-Client
// zieht, die Server/Client-Grenze bricht (AGENTS.md, Regel 13) — dieselbe
// Trennung wie lib/aktivitaet.ts zu lib/aktivitaetsliste.ts.
import { createClient } from "@/lib/supabase/server";
import type { Startzeit, Tageszeit, VerkehrsPunkt } from "@/lib/ruhigeZeiten";

export interface RuhigeZeitenDaten {
  punkte: VerkehrsPunkt[];
  startzeiten: Startzeit[];
  berechnetAm: string | null;
}

const LEER: RuhigeZeitenDaten = { punkte: [], startzeiten: [], berechnetAm: null };

interface StartzeitZeile {
  wochentag: number;
  tageszeit: Tageszeit;
  anteil: number;
}

export async function getRuhigeZeiten(routeId: string): Promise<RuhigeZeitenDaten> {
  const supabase = await createClient();

  const [verkehr, stand, startzeiten] = await Promise.all([
    supabase
      .from("strecken_verkehr")
      .select("wochentag, stunde, faktor")
      .eq("route_id", routeId)
      .returns<{ wochentag: number; stunde: number; faktor: number }[]>(),
    supabase
      .from("strecken_verkehr_stand")
      .select("berechnet_am")
      .eq("route_id", routeId)
      .maybeSingle<{ berechnet_am: string }>(),
    // Liefert unter zwanzig Starts im letzten Jahr bewusst keine Zeile (0105).
    supabase.rpc("strecken_startzeiten", { p_route_id: routeId }),
  ]);

  if (verkehr.error) {
    console.error("Verkehrsprofil konnte nicht geladen werden", { routeId }, verkehr.error);
  }

  return {
    ...LEER,
    punkte: (verkehr.data ?? []).map((p) => ({
      wochentag: p.wochentag,
      stunde: p.stunde,
      faktor: p.faktor,
    })),
    startzeiten: ((startzeiten.data as StartzeitZeile[] | null) ?? []).map((s) => ({
      wochentag: s.wochentag,
      tageszeit: s.tageszeit,
      anteil: s.anteil,
    })),
    berechnetAm: stand.data?.berechnet_am ?? null,
  };
}
