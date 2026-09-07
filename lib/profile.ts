import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { throwOnQueryError } from "@/lib/queryError";
import type { PublicFahrt, Vehicle } from "@/types/database";

export interface PublicProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  zeigtAvatar: boolean;
  zeigtFahrzeuge: boolean;
  zeigtPaesse: boolean;
  zeigtHoehenmeter: boolean;
  zeigtDistanz: boolean;
  zeigtFollowerListe: boolean;
  vehicles: Vehicle[];
  fahrten: PublicFahrt[];
  passCount: number;
  hoehenmeter: number;
  distanzKm: number;
}

// Fahrzeuge werden nur befüllt, wenn der Nutzer das per Profileinstellung
// freigegeben hat. Fahrten kommen direkt aus public_fahrten (0017/0018) —
// die View filtert bereits auf ist_oeffentlich=true pro Fahrt. Die
// zusammenfassenden Kennzahlen (Pässe/Höhenmeter/Distanz) werden IMMER aus
// diesen Fahrten berechnet, aber nur je nach eigenem Opt-in ausgegeben —
// so kann jemand einzelne Fahrten teilen, ohne automatisch seine
// Lebenszeit-Summen preiszugeben.
// Mit React cache() umschlossen: generateMetadata und die Page selbst
// (app/fahrer/[id]/page.tsx) rufen dasselbe Profil sonst zweimal pro
// Request ab.
export const getPublicProfile = cache(async function getPublicProfile(
  userId: string,
): Promise<PublicProfile | null> {
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, avatar_url, zeigt_fahrzeuge, zeigt_avatar, zeigt_paesse, zeigt_hoehenmeter, zeigt_distanz, zeigt_follower_liste",
    )
    .eq("id", userId)
    .maybeSingle();

  // Ohne diese Unterscheidung würde jeder Query-Fehler zu einem 404
  // (app/fahrer/[id]/page.tsx ruft bei null notFound()). Siehe
  // lib/queryError.ts.
  throwOnQueryError(error, "Profil");

  if (!profile) return null;

  const [vehiclesResult, fahrtenResult] = await Promise.all([
    profile.zeigt_fahrzeuge
      ? supabase.from("vehicles").select("*").eq("user_id", userId)
      : Promise.resolve({ data: [] as Vehicle[], error: null }),
    supabase.from("public_fahrten").select("*").eq("user_id", userId),
  ]);

  // Hier wiegt das besonders schwer: eine gescheiterte Fahrtenabfrage würde
  // als leere Liste durchgehen und das Profil zeigte "0 Pässe, 0 km,
  // 0 Höhenmeter" — eine Zahl, die wie eine Tatsache aussieht, statt einer
  // Fehlermeldung. Dasselbe gilt für die Fahrzeugliste.
  throwOnQueryError(vehiclesResult.error, "Fahrzeuge");
  throwOnQueryError(fahrtenResult.error, "Fahrten");

  const fahrten = (fahrtenResult.data as PublicFahrt[]) ?? [];
  // Pässe und Höhenmeter zählen nur Streckenfahrten: seit
  // 0044_freie_fahrten.sql kann route_id null sein, und ohne diesen Filter
  // liefe null als eigener "Pass" in die Menge bzw. als null in die
  // routes-Abfrage. Die Distanzsumme dagegen umfasst bewusst jede Fahrt.
  const streckenFahrten = fahrten.filter((f) => f.route_id !== null);
  const passCount = new Set(streckenFahrten.map((f) => f.route_id)).size;
  const distanzKm = fahrten.reduce((sum, f) => sum + (f.distanz_km ?? 0), 0);

  let hoehenmeter = 0;
  if (streckenFahrten.length > 0) {
    const routeIds = [...new Set(streckenFahrten.map((f) => f.route_id))];
    const { data: routes, error: routesError } = await supabase
      .from("routes")
      .select("id, hoehe_m")
      .in("id", routeIds);
    throwOnQueryError(routesError, "Strecken zu den Fahrten");
    const hoeheById = new Map((routes ?? []).map((r) => [r.id, r.hoehe_m ?? 0]));
    hoehenmeter = streckenFahrten.reduce((sum, f) => sum + (hoeheById.get(f.route_id!) ?? 0), 0);
  }

  return {
    id: profile.id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    zeigtAvatar: profile.zeigt_avatar,
    zeigtFahrzeuge: profile.zeigt_fahrzeuge,
    zeigtPaesse: profile.zeigt_paesse,
    zeigtHoehenmeter: profile.zeigt_hoehenmeter,
    zeigtDistanz: profile.zeigt_distanz,
    zeigtFollowerListe: profile.zeigt_follower_liste,
    vehicles: (vehiclesResult.data as Vehicle[]) ?? [],
    fahrten,
    passCount,
    hoehenmeter,
    distanzKm,
  };
});
