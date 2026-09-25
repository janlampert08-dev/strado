import { createClient } from "@/lib/supabase/server";
import { privatzonenGeheimnis, verschleiertGekappt } from "@/lib/privatzone";
import { MAX_PRIVACY_RADIUS_M, toEwktLineString } from "@/lib/track";
import type { GeoLineString } from "@/types/database";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Bewusst kein "use server"-Modul: die Funktionen hier nehmen einen fertigen
// Supabase-Client entgegen und wären als Server Actions ein von aussen
// aufrufbarer Endpunkt. Sie werden ausschliesslich von Server Actions
// (lib/actions/completions.ts, lib/actions/profile.ts) benutzt.

// Der eingestellte Privatzonen-Radius des Nutzers.
//
// Der Rückfallwert ist bewusst MAX_PRIVACY_RADIUS_M und nicht der Standard:
// Vorher stand hier DEFAULT_PRIVACY_RADIUS_M (200 m) mit dem Kommentar "im
// Zweifel wird gekappt, nicht veröffentlicht". Das stimmt nur für Konten, die
// den Standard nie verändert haben. Wer 500 m eingestellt hat, bekam bei
// einem Lesefehler 200 m — also 300 m WENIGER Schutz als verlangt, und zwar
// genau an den beiden Enden des Tracks, an denen die Wohnadresse liegt.
// Zusätzlich wurde der Fehler gar nicht erst betrachtet: `const { data }`
// verwirft ihn, ein Ausfall der Datenbank war von "Nutzer hat 200 m
// eingestellt" nicht zu unterscheiden.
//
// Der strengste Wert als Rückfall dreht die Fehlerrichtung um: Im Zweifel
// wird zu viel gekappt. Das kostet im schlimmsten Fall ein Stück Kartenlinie
// bei jemandem, der die Privatzone bewusst abgeschaltet hat — die
// Gegenrichtung kostet eine Adresse.
//
// GELESEN WIRD ÜBER meine_privatzone() (0132)
//
// Bis 0132 hatte authenticated einen Spalten-Grant auf privatzone_radius_m,
// und weil die SELECT-Policy auf profiles zeilenoffen ist, konnte jeder
// eingeloggte Nutzer den Radius JEDES anderen lesen — die halbe Arbeit, um
// aus den Enden seiner Tracks die Haustür zu bestimmen. 0132 nimmt den
// Grant zurück; der eigene Wert kommt nur noch über die SECURITY-DEFINER-
// Funktion, die auf auth.uid() festgelegt ist. Deshalb spielt userId hier
// für die Abfrage keine Rolle mehr: alle Aufrufer übergeben ohnehin die ID
// der angemeldeten Sitzung.
//
// Solange 0132 noch nicht eingespielt ist, fehlt die Funktion (PGRST202);
// dann gilt der bisherige Weg über die Spalte, damit der Code vor der
// Migration deployt werden kann. Nach der Migration schlägt genau dieser
// Weg fehl — er wird aber nicht mehr erreicht.
export async function privacyRadiusM(supabase: ServerClient, userId: string): Promise<number> {
  const ergebnis = await eigenerPrivatzonenRadius(supabase);
  if (ergebnis.fehler) {
    console.error("Privatzonen-Radius konnte nicht gelesen werden", { userId }, ergebnis.fehler);
    return MAX_PRIVACY_RADIUS_M;
  }
  return ergebnis.radiusM ?? MAX_PRIVACY_RADIUS_M;
}

// Der Radius der angemeldeten Person, ohne Rückfallwert — die
// Einstellungsseite braucht den Unterschied zwischen "nicht lesbar" und
// "gelesen", privacyRadiusM oben macht aus beidem die strengste Stufe.
export async function eigenerPrivatzonenRadius(
  supabase: ServerClient,
): Promise<{ radiusM: number | null; fehler: unknown }> {
  const { data, error } = await supabase.rpc("meine_privatzone");
  if (!error) {
    return { radiusM: typeof data === "number" ? data : null, fehler: null };
  }
  if (error.code !== "PGRST202") return { radiusM: null, fehler: error };

  // Vor 0132: direkt aus der Spalte (RLS-Client, eigene Zeile).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { radiusM: null, fehler: new Error("Keine Sitzung") };
  const alt = await supabase
    .from("profiles")
    .select("privatzone_radius_m")
    .eq("id", user.id)
    .maybeSingle<{ privatzone_radius_m: number }>();
  if (alt.error) return { radiusM: null, fehler: alt.error };
  return { radiusM: alt.data?.privatzone_radius_m ?? null, fehler: null };
}

// Die öffentlich sichtbaren Koordinaten eines Tracks: Anfang und Ende
// innerhalb der verschleierten Privatzone entfernt (lib/privatzone.ts).
// Leer, wenn danach zu wenig übrig bleibt oder kein Servergeheimnis da ist —
// dann zeigt die Fahrt eben keine Karte, aber niemals eine ungekappte oder
// nachrechenbar gekappte.
//
// Auch der Ortsname einer freien Fahrt (start_ort) wird aus dem ersten
// dieser Punkte bestimmt und nicht aus dem rohen Start — sonst nennte die
// Fahrt das Quartier, das der Track gerade verschweigt.
export function oeffentlicheKoordinaten(
  coordinates: [number, number][],
  radiusM: number,
  userId: string,
): [number, number][] {
  if (radiusM <= 0) return [...coordinates];
  const geheimnis = privatzonenGeheimnis();
  if (!geheimnis) {
    console.error("Privatzone: kein Servergeheimnis (PRIVATZONE_SECRET/SUPABASE_SECRET_KEY)");
    return [];
  }
  return verschleiertGekappt(coordinates, radiusM, userId, geheimnis);
}

export async function publicTrackEwkt(
  supabase: ServerClient,
  userId: string,
  coordinates: [number, number][],
): Promise<string | null> {
  const radiusM = await privacyRadiusM(supabase, userId);
  return toEwktLineString(oeffentlicheKoordinaten(coordinates, radiusM, userId));
}

// Nach einer Änderung des Radius müssen die bereits geteilten Fahrten neu
// gekappt werden — sonst gölte die neue Einstellung nur für künftige
// Fahrten, und genau die alten wären das Problem.
//
// Die Schleife läuft ausdrücklich nur über die geteilten Fahrten —
// öffentliche UND seit 0145 die für Follower, die denselben gekappten Track
// tragen: private tragen gar keinen (siehe 0045), und deren Zahl ist pro
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
    // Beide geteilten Stufen: eine Follower-Fahrt, die hier fehlte, behielte
    // den alten, weiteren Radius — sichtbar für jeden, der folgt.
    .or("ist_oeffentlich.eq.true,fuer_follower.eq.true")
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
  // JS-Rechnung (oeffentlicheKoordinaten), keine SQL-Operation — siehe Kommentar
  // oben. Ein Block begrenzt nur, wie viele davon gleichzeitig fliegen.
  const BLOCKGROESSE = 25;
  const zeilen = tracks ?? [];
  let alleErfolgreich = true;

  for (let i = 0; i < zeilen.length; i += BLOCKGROESSE) {
    const block = zeilen.slice(i, i + BLOCKGROESSE);
    const ergebnisse = await Promise.all(
      block.map((row) => {
        const cropped = oeffentlicheKoordinaten(row.track_geojson.coordinates, radiusM, userId);
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
