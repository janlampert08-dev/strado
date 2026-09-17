import { createClient } from "@/lib/supabase/server";
import type { PassStrecke } from "@/lib/passSammlung";

// Die Grundmenge der Pass-Sammlung: alle freigegebenen, öffentlichen
// Strecken der Kategorie "passstrasse". SERVER-ONLY (lib/supabase/server).
//
// Eine Abfrage, ohne Geometrie. Die Basistabelle statt routes_geojson: die
// View rechnet für jede Zeile die geography-Spalten in GeoJSON um, und davon
// braucht die Sammlung nichts. RLS läuft als angemeldete Person — die Policy
// aus 0001 gibt freigegebene Strecken frei; Moderatoren sehen darüber hinaus
// unveröffentlichte (0021), und eigene private Strecken sind für ihre
// Ersteller lesbar. Deshalb filtern status_ok UND ist_privat ausdrücklich,
// statt sich auf RLS zu verlassen: der Nenner "von 12" soll für jedes Konto
// derselbe sein, nicht für Moderatoren grösser.
//
// Der Kategorienfilter trifft den GIN-Index routes_kategorien_idx (0001).
// Das limit ist eine Schranke, kein erwarteter Wert: die Schweiz hat keine
// 300 befahrbaren Pässe, eine Liste darüber wäre ein Datenfehler, und eine
// Profilseite soll davon nicht langsam werden.
const MAX_PAESSE = 300;

export async function getPassStrecken(): Promise<{ paesse: PassStrecke[]; fehler: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes")
    .select("id, name, region, hoehe_m")
    .eq("status_ok", true)
    .eq("ist_privat", false)
    .contains("kategorien", ["passstrasse"])
    .order("name")
    .limit(MAX_PAESSE)
    .returns<PassStrecke[]>();

  if (error) {
    // Kein throw: die Sammlung ist ein Zusatz auf der Profilseite, und ein
    // Ladefehler hier soll nicht die ganze Seite in die Fehlergrenze
    // schicken. Die Komponente zeigt dann einen Satz statt "0 von 0".
    console.error("Passstrecken konnten nicht geladen werden:", error.message);
    return { paesse: [], fehler: true };
  }

  return { paesse: data ?? [], fehler: false };
}
