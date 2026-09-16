import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { throwOnQueryError } from "@/lib/queryError";
import { mitSigniertenFotoUrls } from "@/lib/storageUrls";
import type {
  CompletionPhoto,
  FahrtArt,
  FahrtTrack,
  GeoLineString,
  HoehenprofilPunkt,
  Motorklasse,
  PublicCompletionPhoto,
  PublicFahrt,
  PublicFahrtTrack,
} from "@/types/database";

// Fotozeilen (beide Quellen liefern dieselben zwei Felder) in die
// Anzeigeform bringen und dabei signieren — der Bucket ist seit 0061 privat,
// die gespeicherte URL allein ist nicht mehr abrufbar.
async function signierteFotos(
  zeilen: { id: string; foto_url: string }[],
): Promise<CompletionPhotoItem[]> {
  const signiert = await mitSigniertenFotoUrls(
    zeilen,
    (foto) => foto.foto_url,
    (foto, foto_url) => ({ ...foto, foto_url }),
  );
  return signiert.map((foto) => ({ id: foto.id, fotoUrl: foto.foto_url }));
}

// Anzeigename einer freien Fahrt: der selbst vergebene Titel, sonst der
// per Reverse-Geocoding ermittelte Startort, sonst ein neutraler Fallback.
// Eine Streckenfahrt trägt stattdessen immer den Streckennamen.
export function freieFahrtTitel(titel: string | null, startOrt: string | null): string {
  if (titel) return titel;
  return startOrt ? `Fahrt ab ${startOrt}` : "Freie Fahrt";
}

export interface CompletionPhotoItem {
  id: string;
  fotoUrl: string;
}

// Rein privat: nur die eigene bisherige Bestzeit des Nutzers für diese
// Strecke, kein Vergleich mit anderen (RLS erlaubt ohnehin nur eigene Zeilen).
export async function getPersonalBestSeconds(
  routeId: string,
  userId: string,
): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("route_completions")
    .select("dauer_sekunden")
    .eq("route_id", routeId)
    .eq("user_id", userId)
    .not("dauer_sekunden", "is", null)
    .order("dauer_sekunden", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.dauer_sekunden ?? null;
}

export interface DetectedSegment {
  id: string;
  routeId: string;
  routeName: string;
  distanzKm: number | null;
  dauerSekunden: number | null;
  istOeffentlich: boolean;
  abdeckungProzent: number | null;
}

// Innerhalb einer freien Fahrt automatisch erkannte Streckenabschnitte
// (lib/lapDetection.ts, save_free_ride_with_segments in
// 0050_streckenerkennung_in_freier_fahrt.sql). RLS auf route_completions
// beschränkt das ohnehin auf eigene Zeilen — der zusätzliche
// user_id-Filter ist wie an anderer Stelle in dieser Datei redundant, aber
// explizit statt sich allein auf die Policy zu verlassen. Bewusst nicht
// über public_fahrten (die Verknüpfung ist dort kein Teil der View, siehe
// CompletionDetail.parentCompletionId) — nur der Besitzer sieht diese Liste.
export async function getDetectedSegments(
  parentId: string,
  viewerId: string,
): Promise<DetectedSegment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_completions")
    .select(
      "id, route_id, distanz_km, dauer_sekunden, ist_oeffentlich, abdeckung_prozent, routes(name)",
    )
    .eq("parent_completion_id", parentId)
    .eq("user_id", viewerId)
    .eq("art", "strecke")
    .order("datum", { ascending: true })
    .returns<
      {
        id: string;
        route_id: string;
        distanz_km: number | null;
        dauer_sekunden: number | null;
        ist_oeffentlich: boolean;
        abdeckung_prozent: number | null;
        routes: { name: string } | null;
      }[]
    >();

  // Ein echter Query-Fehler darf nicht als "keine Segmente" durchgehen —
  // sonst verschwände eine bereits erkannte Streckenfahrt für den Besitzer
  // kommentarlos von seiner eigenen Fahrt-Detailseite. Siehe lib/queryError.ts.
  throwOnQueryError(error, "Erkannte Streckenabschnitte");
  if (!data) return [];

  return data.map((row) => ({
    id: row.id,
    routeId: row.route_id,
    routeName: row.routes?.name ?? "Strecke",
    distanzKm: row.distanz_km,
    dauerSekunden: row.dauer_sekunden,
    istOeffentlich: row.ist_oeffentlich,
    abdeckungProzent: row.abdeckung_prozent,
  }));
}

export interface CompletionDetail {
  id: string;
  art: FahrtArt;
  // null bei einer freien Fahrt (art === "frei").
  routeId: string | null;
  userId: string;
  datum: string;
  dauerSekunden: number | null;
  distanzKm: number | null;
  istOeffentlich: boolean;
  // Für private Fahrten nur gesetzt, wenn der Betrachter der Besitzer ist.
  // Für öffentliche Fahrten (ab 0035_public_fahrten_notiz.sql) für jeden
  // Betrachter gesetzt — teilt sich dieselbe Sichtbarkeit wie die Fahrt
  // selbst, siehe public_fahrten-View-Kommentar.
  abdeckungProzent: number | null;
  notiz: string | null;
  vehicle: { typ: string; marke: string; modell: string } | null;
  displayName: string | null;
  avatarUrl: string | null;
  // Ab 0036_completion_photos.sql: mehrere Fotos statt einem einzelnen
  // fotoUrl-Feld, in Anzeigereihenfolge (position).
  photos: CompletionPhotoItem[];
  isOwner: boolean;
  // Ab 0044_freie_fahrten.sql, nur bei freien Fahrten gesetzt: eigener
  // Titel, Ortsbezug, Anstieg und Höhenprofil treten an die Stelle dessen,
  // was bei einer Streckenfahrt aus der Strecke selbst kommt.
  titel: string | null;
  startOrt: string | null;
  region: string | null;
  bewegteZeitSekunden: number | null;
  hoehenmeterAufstieg: number | null;
  hoehenprofil: HoehenprofilPunkt[] | null;
  // Der aufgezeichnete GPS-Track — nur für den Besitzer und vorerst nur bei
  // freien Fahrten geladen (fahrt_tracks läuft mit den Rechten des
  // Aufrufers, liefert also ohnehin nur eigene Fahrten). Bei Streckenfahrten
  // zeigt die Detailkarte weiterhin die Streckengeometrie.
  track: GeoLineString | null;
  // Ab 0050_streckenerkennung_in_freier_fahrt.sql: gesetzt, wenn diese
  // Streckenfahrt automatisch aus einer freien Fahrt erkannt wurde (Verweis
  // auf deren completion_id) — für den Rückverweis "Teil einer längeren
  // Fahrt" auf der Detailseite. Bewusst nur für den Besitzer geladen (siehe
  // unten): public_fahrten führt die Spalte absichtlich nicht.
  parentCompletionId: string | null;
  // Die Motorklassen der Fahrt (0080), bewusst NUR für den Besitzer geladen.
  // Die gewertete Klasse ist zwar über die Bestenlisten-Views öffentlich —
  // der Vergleich "angegeben X, gewertet Y" ist es nicht: er liest sich wie
  // ein Vorwurf, und der häufigste Grund für eine Abweichung ist ein
  // Tippfehler in der Leistungsangabe, nicht Betrug. Er gehört deshalb an
  // den Fahrer selbst und an niemanden sonst.
  motorklasse: Motorklasse | null;
  motorklasseGewertet: Motorklasse | null;
}

// Für die Fahrt-Detailseite (app/fahrten/[id]/page.tsx) — zwei Pfade, je
// nachdem wer die Fahrt gefahren ist:
// 1. Öffentliche Fahrt (auch fremde): über public_fahrten (0017/0018/0029/
//    0030/0032). Die View läuft mit den Rechten ihres Owners und umgeht
//    damit RLS auf route_completions (die sonst nur dem Besitzer selbst
//    SELECT erlaubt) — funktioniert dadurch auch für anonyme Betrachter.
// 2. Alles andere (private Fahrt, oder gar nicht öffentlich geteilt):
//    direkter Zugriff auf route_completions, RLS erlaubt das nur dem
//    Besitzer selbst — für jeden anderen liefert das keine Zeile, exakt
//    das gewünschte Verhalten (private Fahrten fremder Nutzer bleiben
//    unsichtbar).
export const getCompletionDetail = cache(async function getCompletionDetail(
  id: string,
  viewerId: string | null,
): Promise<CompletionDetail | null> {
  const supabase = await createClient();

  const { data: publicRow, error: publicError } = await supabase
    .from("public_fahrten")
    .select("*")
    .eq("completion_id", id)
    .maybeSingle();

  // Ohne diese Unterscheidung würde jeder Query-Fehler zu einem 404 — die
  // Seite behauptete dann, die Fahrt existiere nicht, statt den Fehler zu
  // zeigen. Siehe lib/queryError.ts.
  throwOnQueryError(publicError, "Fahrt");

  if (publicRow) {
    const row = publicRow as PublicFahrt;

    const [
      { data: photoRows, error: photoError },
      { data: trackRow, error: trackError },
    ] = await Promise.all([
      supabase
        .from("public_completion_photos")
        .select("id, foto_url")
        .eq("completion_id", row.completion_id)
        .order("position", { ascending: true }),
      // Nur die gekappte Fassung (0045) — der rohe Track ist selbst für den
      // Besitzer nur über den Pfad unten erreichbar.
      supabase
        .from("public_fahrt_tracks")
        .select("track_geojson")
        .eq("completion_id", row.completion_id)
        .maybeSingle<Pick<PublicFahrtTrack, "track_geojson">>(),
    ]);

    // Eine leere Fotoliste bzw. ein fehlender Track sind ein gültiges
    // Ergebnis — ein gescheiterter Query darf nicht als eines davon
    // durchgehen und die Fahrt stillschweigend ärmer aussehen lassen.
    throwOnQueryError(photoError, "Fotos der Fahrt");
    throwOnQueryError(trackError, "Track der Fahrt");

    // Für den Fahrer selbst zwei Dinge nachladen, die die öffentliche View
    // bewusst nicht enthält: sein Höhenprofil (siehe unten) und seinen
    // vollständigen, ungekappten Track. Die Privatzone schützt die Fahrt vor
    // anderen — die eigene Ansicht bleibt vollständig, so wie es die
    // Einstellung zusagt.
    let ownHoehenprofil: HoehenprofilPunkt[] | null = null;
    let ownTrack: GeoLineString | null = null;
    // Nur für den Besitzer selbst gesetzt — siehe parentCompletionId weiter
    // unten und der Kommentar auf CompletionDetail.parentCompletionId.
    let ownParentCompletionId: string | null = null;
    let ownMotorklasse: Motorklasse | null = null;
    let ownMotorklasseGewertet: Motorklasse | null = null;
    if (viewerId === row.user_id) {
      const [
        { data: own, error: ownError },
        { data: ownTrackRow, error: ownTrackError },
      ] = await Promise.all([
        supabase
          .from("route_completions")
          .select("hoehenprofil, parent_completion_id, motorklasse, motorklasse_gewertet")
          .eq("id", row.completion_id)
          .eq("user_id", viewerId)
          .maybeSingle<{
            hoehenprofil: HoehenprofilPunkt[] | null;
            parent_completion_id: string | null;
            motorklasse: Motorklasse | null;
            motorklasse_gewertet: Motorklasse | null;
          }>(),
        supabase
          .from("fahrt_tracks")
          .select("track_geojson")
          .eq("completion_id", row.completion_id)
          .maybeSingle<Pick<FahrtTrack, "track_geojson">>(),
      ]);
      throwOnQueryError(ownError, "Höhenprofil der Fahrt");
      throwOnQueryError(ownTrackError, "Track der Fahrt");

      ownHoehenprofil = own?.hoehenprofil ?? null;
      ownTrack = ownTrackRow?.track_geojson ?? null;
      ownParentCompletionId = own?.parent_completion_id ?? null;
      ownMotorklasse = own?.motorklasse ?? null;
      ownMotorklasseGewertet = own?.motorklasse_gewertet ?? null;
    }

    return {
      id: row.completion_id,
      art: row.art,
      routeId: row.route_id,
      userId: row.user_id,
      datum: row.datum,
      dauerSekunden: row.dauer_sekunden,
      distanzKm: row.distanz_km,
      istOeffentlich: true,
      // Ab 0035_public_fahrten_notiz.sql: teilt sich die Sichtbarkeit der
      // Fahrt selbst — hier immer gesetzt (die View filtert bereits auf
      // ist_oeffentlich = true), nicht mehr nur für den Besitzer.
      abdeckungProzent: row.abdeckung_prozent,
      notiz: row.notiz,
      vehicle: row.fahrzeug_marke
        ? { typ: row.fahrzeug_typ!, marke: row.fahrzeug_marke, modell: row.fahrzeug_modell! }
        : null,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      // Signiert, weil der Bucket seit 0061 privat ist. Die View enthält nur
      // öffentliche Fahrten, die Berechtigung ist also bereits geklärt.
      photos: await signierteFotos(
        (photoRows as Pick<PublicCompletionPhoto, "id" | "foto_url">[]) ?? [],
      ),
      isOwner: viewerId === row.user_id,
      titel: row.titel,
      startOrt: row.start_ort,
      region: row.region,
      bewegteZeitSekunden: row.bewegte_zeit_sekunden,
      hoehenmeterAufstieg: row.hoehenmeter_aufstieg,
      // Das Höhenprofil steht bewusst nicht in public_fahrten — ein ~80
      // Punkte grosses JSON-Feld, das Feed und Profil bei ihrem select("*")
      // jedes Mal mitzögen. Für den Besitzer wird es einzeln nachgeladen,
      // damit er es nicht verliert, sobald er seine Fahrt teilt (derselbe
      // Fehler, den 0035_public_fahrten_notiz.sql für Notiz und Fahrzeug
      // korrigiert hat).
      hoehenprofil: ownHoehenprofil,
      track: ownTrack ?? trackRow?.track_geojson ?? null,
      // public_fahrten führt parent_completion_id absichtlich nicht (siehe
      // 0050) — der Rückverweis "Teil einer längeren Fahrt" bleibt fremden
      // Betrachtern verborgen. Für den Besitzer selbst (ownParentCompletionId
      // oben, nur dann geladen) bleibt er erhalten, auch wenn diese
      // Streckenfahrt öffentlich ist und deshalb über public_fahrten läuft.
      parentCompletionId: ownParentCompletionId,
      motorklasse: ownMotorklasse,
      motorklasseGewertet: ownMotorklasseGewertet,
    };
  }

  if (!viewerId) return null;

  const { data: own, error: eigeneFahrtError } = await supabase
    .from("route_completions")
    .select(
      "id, art, route_id, user_id, datum, dauer_sekunden, distanz_km, ist_oeffentlich, abdeckung_prozent, notiz, titel, start_ort, region, bewegte_zeit_sekunden, hoehenmeter_aufstieg, hoehenprofil, parent_completion_id, motorklasse, motorklasse_gewertet, vehicles(typ, marke, modell)",
    )
    .eq("id", id)
    .eq("user_id", viewerId)
    .maybeSingle<{
      id: string;
      art: FahrtArt;
      route_id: string | null;
      user_id: string;
      datum: string;
      dauer_sekunden: number | null;
      distanz_km: number | null;
      ist_oeffentlich: boolean;
      abdeckung_prozent: number | null;
      notiz: string | null;
      titel: string | null;
      start_ort: string | null;
      region: string | null;
      bewegte_zeit_sekunden: number | null;
      hoehenmeter_aufstieg: number | null;
      hoehenprofil: HoehenprofilPunkt[] | null;
      parent_completion_id: string | null;
      motorklasse: Motorklasse | null;
      motorklasse_gewertet: Motorklasse | null;
      vehicles: { typ: string; marke: string; modell: string } | null;
    }>();

  // Siehe oben: nur eine wirklich fehlende (bzw. fremde) Fahrt ergibt 404.
  throwOnQueryError(eigeneFahrtError, "Fahrt");

  if (!own) return null;

  const [
    { data: profile, error: profileError },
    { data: photoRows, error: eigeneFotosError },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", viewerId).maybeSingle(),
    supabase
      .from("completion_photos")
      .select("id, foto_url")
      .eq("completion_id", id)
      .eq("user_id", viewerId)
      .order("position", { ascending: true }),
  ]);

  throwOnQueryError(profileError, "Profil zur Fahrt");
  throwOnQueryError(eigeneFotosError, "Fotos der Fahrt");

  // Nur bei freien Fahrten nötig: die Detailkarte einer Streckenfahrt zeigt
  // weiterhin die Streckengeometrie, dafür braucht es keinen zweiten Zugriff.
  let track: GeoLineString | null = null;
  if (own.art === "frei") {
    const { data: trackRow, error: trackError } = await supabase
      .from("fahrt_tracks")
      .select("track_geojson")
      .eq("completion_id", id)
      .maybeSingle<Pick<FahrtTrack, "track_geojson">>();
    throwOnQueryError(trackError, "Track der Fahrt");
    track = trackRow?.track_geojson ?? null;
  }

  return {
    id: own.id,
    art: own.art,
    routeId: own.route_id,
    userId: own.user_id,
    datum: own.datum,
    dauerSekunden: own.dauer_sekunden,
    distanzKm: own.distanz_km,
    istOeffentlich: own.ist_oeffentlich,
    abdeckungProzent: own.abdeckung_prozent,
    notiz: own.notiz,
    vehicle: own.vehicles,
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    // Eigene, ggf. private Fahrt: die Zeilen kommen unter RLS aus
    // completion_photos, gehören also dem Betrachter selbst.
    photos: await signierteFotos((photoRows as Pick<CompletionPhoto, "id" | "foto_url">[]) ?? []),
    isOwner: true,
    titel: own.titel,
    startOrt: own.start_ort,
    region: own.region,
    bewegteZeitSekunden: own.bewegte_zeit_sekunden,
    hoehenmeterAufstieg: own.hoehenmeter_aufstieg,
    hoehenprofil: own.hoehenprofil,
    track,
    parentCompletionId: own.parent_completion_id,
    motorklasse: own.motorklasse,
    motorklasseGewertet: own.motorklasse_gewertet,
  };
});
