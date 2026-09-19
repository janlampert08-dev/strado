import { createClient } from "@/lib/supabase/server";
import type { PassFahrt, PassStrecke } from "@/lib/passSammlung";

// Die Daten der Pass-Sammlung: der Katalog (`paesse`, 0104) und die eigenen
// Passfahrten (`meine_passfahrten()`, 0113). SERVER-ONLY (lib/supabase/server).
//
// Dieselbe Quelle wie die freie Passsammlung auf /paesse und die Zeile
// "Passsammlung X von Y" auf dem Profil (getSammlungsStand in lib/paesse.ts)
// — damit die Premium-Ansicht dieselbe Zahl zeigt und nur mehr darüber
// erzählt. Bis 2026-09-18 zählte sie Strecken der Kategorie "passstrasse";
// warum das endete, steht im Kopf von lib/passSammlung.ts.
//
// Kein throw: die Sammlung ist ein Zusatz auf der Profilseite, und ein
// Ladefehler hier soll nicht die ganze Seite in die Fehlergrenze schicken.
// Die Komponente zeigt dann einen Satz statt "0 von 0".
export async function getPassSammlungsDaten(): Promise<{
  paesse: PassStrecke[];
  fahrten: PassFahrt[];
  fehler: boolean;
}> {
  const supabase = await createClient();
  const [katalog, eigene] = await Promise.all([
    supabase
      .from("paesse")
      .select("id, name, hoehe_m, kantone")
      .order("name")
      .returns<{ id: string; name: string; hoehe_m: number | null; kantone: string[] | null }[]>(),
    supabase.rpc("meine_passfahrten"),
  ]);

  if (katalog.error || eigene.error) {
    console.error(
      "Pass-Sammlung konnte nicht geladen werden:",
      katalog.error?.message ?? eigene.error?.message,
    );
    return { paesse: [], fahrten: [], fehler: true };
  }

  return {
    paesse: (katalog.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      hoehe_m: p.hoehe_m,
      region: p.kantone && p.kantone.length > 0 ? p.kantone.join(" · ") : null,
    })),
    fahrten: (eigene.data as PassFahrt[] | null) ?? [],
    fehler: false,
  };
}
