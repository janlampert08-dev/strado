import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PRIVACY_RADIUS_M, cropTrackEnds, toEwktLineString } from "@/lib/track";
import type { GeoLineString } from "@/types/database";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Bewusst kein "use server"-Modul: die Funktionen hier nehmen einen fertigen
// Supabase-Client entgegen und wären als Server Actions ein von aussen
// aufrufbarer Endpunkt. Sie werden ausschliesslich von Server Actions
// (lib/actions/completions.ts, lib/actions/profile.ts) benutzt.

// Der eingestellte Privatzonen-Radius des Nutzers. Fällt auf den Standard
// zurück, wenn das Profil nicht gelesen werden kann — im Zweifel wird
// gekappt, nicht veröffentlicht.
export async function privacyRadiusM(supabase: ServerClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("privatzone_radius_m")
    .eq("id", userId)
    .maybeSingle<{ privatzone_radius_m: number }>();
  return data?.privatzone_radius_m ?? DEFAULT_PRIVACY_RADIUS_M;
}

// Die öffentlich sichtbare Fassung eines Tracks: Anfang und Ende innerhalb
// der Privatzone entfernt (siehe cropTrackEnds). null, wenn danach zu wenig
// übrig bleibt — dann zeigt die Fahrt eben keine Karte, aber niemals eine
// ungekappte.
export async function publicTrackEwkt(
  supabase: ServerClient,
  userId: string,
  coordinates: [number, number][],
): Promise<string | null> {
  const radiusM = await privacyRadiusM(supabase, userId);
  return toEwktLineString(cropTrackEnds(coordinates, radiusM));
}

// Nach einer Änderung des Radius müssen die bereits geteilten Fahrten neu
// gekappt werden — sonst gölte die neue Einstellung nur für künftige
// Fahrten, und genau die alten wären das Problem.
//
// Die Schleife läuft ausdrücklich nur über die öffentlichen Fahrten: private
// tragen gar keinen öffentlichen Track (siehe 0045), und deren Zahl ist pro
// Nutzer klein. Ein einzelnes UPDATE über alle Zeilen ginge nicht, weil die
// Kappung pro Fahrt eine eigene Geometrie ergibt und in SQL nur
// näherungsweise möglich wäre (siehe Migrationskommentar).
//
// Der Rückgabewert sagt, ob wirklich jede betroffene Fahrt neu zugeschnitten
// wurde. Ein stillschweigend übergangener Fehler hiesse: der Nutzer stellt
// den Radius enger, bekommt "Gespeichert." zu sehen — und der weitere Track
// bleibt öffentlich.
export async function recomputePublicTracks(
  supabase: ServerClient,
  userId: string,
  radiusM: number,
): Promise<boolean> {
  const { data: rides, error: ridesError } = await supabase
    .from("route_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("ist_oeffentlich", true)
    .returns<{ id: string }[]>();

  if (ridesError) return false;
  if (!rides || rides.length === 0) return true;

  const { data: tracks, error: tracksError } = await supabase
    .from("fahrt_tracks")
    .select("completion_id, track_geojson")
    .in(
      "completion_id",
      rides.map((r) => r.id),
    )
    .returns<{ completion_id: string; track_geojson: GeoLineString }[]>();

  if (tracksError) return false;

  // In Blöcken statt einzeln nacheinander. Wer viele Fahrten geteilt hat
  // und seinen Privatzonen-Radius ändert, löste sonst genauso viele
  // sequenzielle Roundtrips aus — in einer Server Action, die auf Vercel
  // ein Zeitlimit hat. Bricht sie in der Mitte ab, bleibt ein Teil der
  // Tracks mit dem alten, WEITEREN Radius öffentlich; das ist der Grund,
  // warum der Rückgabewert hier zählt und der Aufrufer bei false eine
  // Fehlermeldung zeigt statt "Gespeichert.".
  //
  // Bewusst kein einzelnes UPDATE über alle Zeilen: der Zuschnitt ist
  // JS-Rechnung (cropTrackEnds), keine SQL-Operation — siehe Kommentar
  // oben. Ein Block begrenzt nur, wie viele davon gleichzeitig fliegen.
  const BLOCKGROESSE = 25;
  const zeilen = tracks ?? [];
  let alleErfolgreich = true;

  for (let i = 0; i < zeilen.length; i += BLOCKGROESSE) {
    const block = zeilen.slice(i, i + BLOCKGROESSE);
    const ergebnisse = await Promise.all(
      block.map((row) => {
        const cropped = cropTrackEnds(row.track_geojson.coordinates, radiusM);
        return supabase
          .from("route_completions")
          .update({ track_oeffentlich: toEwktLineString(cropped) })
          .eq("id", row.completion_id)
          .eq("user_id", userId);
      }),
    );
    if (ergebnisse.some(({ error }) => error)) alleErfolgreich = false;
  }

  return alleErfolgreich;
}
