import FreeRideForm from "@/components/FreeRideForm";
import { createClient } from "@/lib/supabase/server";
import { getRoutes } from "@/lib/routes";
import type { Vehicle } from "@/types/database";

export const metadata = {
  title: "Fahrt aufzeichnen – Cornice",
};

// Einstieg für eine freie Fahrt (ohne Strecke). Das Gegenstück zur
// Streckenfahrt, die über "Strecke starten" auf der Streckenseite beginnt
// (components/GefahrenSection.tsx) — beide landen im selben Recorder, nur
// mit bzw. ohne Streckenbezug.
//
// Ohne Session kein Redirect mehr auf /anmelden: aufzeichnen darf jeder,
// das Konto braucht erst das Speichern (Gate im Fazit-Screen, siehe
// FreeRideForm.tsx). Der Server bleibt davon unberührt — logFreeRide
// (lib/actions/completions.ts) weist eine Fahrt ohne Session weiterhin ab,
// die Lockerung hier ist rein die Sichtbarkeit des Recorders.
export default async function NeueFahrtPage({
  searchParams,
}: {
  // ?fortsetzen=<token> trägt den Marker, den das Anmelde-Gate im Fazit einer
  // Gastfahrt ausgestellt hat (siehe FreeRideForm.tsx) — nur mit ihm darf die
  // als Gast aufgezeichnete Fahrt an das nun angemeldete Konto übergehen.
  // Geprüft und eingelöst wird er ausschliesslich im Client gegen den
  // gespeicherten Wert (adoptGuestTrackingSnapshot); hier ist er ein
  // durchgereichter, nicht vertrauenswürdiger Query-Wert. Ohne gültigen
  // Marker bleibt eine liegengebliebene Gastaufzeichnung liegen, statt dem
  // nächsten Konto auf demselben Gerät angeboten zu werden.
  searchParams: Promise<{ fortsetzen?: string }>;
}) {
  const { fortsetzen } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Die freigegebenen Strecken dienen auf der Aufzeichnungskarte nur der
  // Orientierung ("fahre ich gerade auf einer kuratierten Strecke?") — sie
  // sind dort bewusst nicht anklickbar, siehe routesClickable in RouteMap.
  // Ein Ladefehler kostet nur diese Orientierungshilfe, nicht die
  // Aufzeichnung: dann startet die Karte eben ohne Streckenlinien.
  //
  // Fahrzeuge gibt es nur für angemeldete Nutzer — ein Gast sieht die
  // Fahrzeugauswahl ohnehin nicht, weil er statt des Speichern-Formulars
  // das Anmelde-Gate bekommt.
  const [vehicles, { routes }] = await Promise.all([
    user
      ? supabase
          .from("vehicles")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .then(({ data }) => (data as Vehicle[] | null) ?? [])
      : Promise.resolve([] as Vehicle[]),
    getRoutes(),
  ]);

  return (
    <FreeRideForm
      userId={user?.id ?? null}
      vehicles={vehicles}
      routes={routes}
      guestContinuationToken={user ? (fortsetzen ?? null) : null}
    />
  );
}
