"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";
import { isRateLimited } from "@/lib/rateLimit";
import {
  buildHoehenprofil,
  computeHoeheUndSteigung,
  countKehren,
  fetchElevationProfile,
} from "@/lib/elevation";
import { deriveRouteLocations } from "@/lib/geocoding";
import { istPremium, privateStreckenKontingent } from "@/lib/premium";
import type { GeoLineString, Kategorie, TempolimitSegment } from "@/types/database";

export interface ProposeRouteState {
  error: string | null;
}

// Grosszügiger als der Bewertungs-/Fahrten-Cooldown (3-5s) — ein Vorschlag
// braucht ohnehin mehrere Sekunden Formular-Interaktion, das Limit soll nur
// Skript-Missbrauch der externen Geocoding-/Höhenprofil-APIs bremsen (siehe
// 0041_route_proposal_cooldown.sql für Details und den race-freien
// DB-seitigen Trigger, der diesen Vorab-Check ergänzt).
const PROPOSE_ROUTE_COOLDOWN_MS = 15_000;
const MAX_NAME_LENGTH = 100;
const MAX_CHARAKTER_TEXT_LENGTH = 500;

// next.config.ts hebt das serverActions-Bodylimit auf 9 MB an (wegen
// uploadAvatar/logTrackedCompletion) — ohne eigene Grenze könnte
// geometry_geojson/tempolimits also ebenfalls bis zu 9 MB gross sein. Das
// würde nicht nur unnötig CPU/Speicher hier kosten, sondern die volle
// Geometrie geht unverändert an den externen Höhenprofil-Dienst
// (fetchElevationProfile) und danach an die propose_route_full-RPC weiter.
// Gleiche Grössenordnung wie MAX_TRAIL_POINTS (lib/track.ts) für GPS-Tracks
// — 20'000 Punkte decken jede real gezeichnete/aufgezeichnete Route ab.
const MAX_COORDINATES = 20_000;
const MIN_COORDINATES = 2;
// ~35 Zeichen pro Koordinatenpaar im JSON, grosszügig aufgerundet.
const MAX_GEOMETRY_JSON_LENGTH = MAX_COORDINATES * 35;
const MAX_TEMPOLIMIT_SEGMENTS = 2000;
const MAX_TEMPOLIMITS_JSON_LENGTH = MAX_TEMPOLIMIT_SEGMENTS * 80;

function isValidCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

// Prüft Grösse und Form, bevor die Geometrie an externe Dienste oder die DB
// geht — anders als bei propose_route_full (0033) gibt es hier noch keine
// serverseitige Grenze; ST_GeomFromGeoJSON in der RPC würde eine strukturell
// falsche Geometrie zwar ablehnen, aber erst nachdem fetchElevationProfile
// und countKehren bereits mit den vollen (potenziell riesigen) Rohdaten
// gelaufen sind.
function parseGeometry(raw: string): GeoLineString | null {
  if (raw.length > MAX_GEOMETRY_JSON_LENGTH) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { type?: unknown }).type !== "LineString" ||
    !Array.isArray((parsed as { coordinates?: unknown }).coordinates)
  ) {
    return null;
  }

  const coordinates = (parsed as { coordinates: unknown[] }).coordinates;
  if (coordinates.length < MIN_COORDINATES || coordinates.length > MAX_COORDINATES) return null;
  if (!coordinates.every(isValidCoordinate)) return null;

  return { type: "LineString", coordinates };
}

function isValidTempolimitSegment(value: unknown): value is TempolimitSegment {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.km_von === "number" &&
    typeof s.km_bis === "number" &&
    typeof s.kmh === "number" &&
    typeof s.bekannt === "boolean" &&
    Number.isFinite(s.km_von) &&
    Number.isFinite(s.km_bis) &&
    Number.isFinite(s.kmh)
  );
}

function parseTempolimits(raw: string): TempolimitSegment[] | null {
  if (raw.length > MAX_TEMPOLIMITS_JSON_LENGTH) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length > MAX_TEMPOLIMIT_SEGMENTS) return null;
  if (!parsed.every(isValidTempolimitSegment)) return null;

  return parsed;
}

export async function proposeRoute(
  _prevState: ProposeRouteState,
  formData: FormData,
): Promise<ProposeRouteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  // Eigene Strecken sind Premium — oder Moderation, die den Bestand ohne
  // Abo kuratiert. Produktentscheid 2026-09-07, bewusster Bruch mit dem
  // additiven Gating aus docs/premium-plan.md Abschnitt 4. Die eigentliche
  // Schranke ist die INSERT-Policy auf routes (0077); sie gilt auch für den
  // Direktweg über PostgREST. Diese Prüfung hier liefert nur die lesbare
  // Antwort, bevor Geocoding und Höhenprofil für nichts laufen.
  const [premium, moderator] = await Promise.all([istPremium(), isModerator(user.id)]);
  if (!premium && !moderator) return { error: "Eigene Strecken gehören zu Premium." };

  if (await isRateLimited(supabase, "routes", "created_at", "erstellt_von", user.id, PROPOSE_ROUTE_COOLDOWN_MS)) {
    return { error: "Bitte warte einen Moment, bevor du eine weitere Strecke erstellst." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const laengeKm = Number(formData.get("laenge_km"));
  const charakterText = String(formData.get("charakter_text") ?? "").trim().slice(0, MAX_CHARAKTER_TEXT_LENGTH) || null;
  const kategorien = formData.getAll("kategorien") as Kategorie[];

  const geometryRaw = String(formData.get("geometry_geojson") ?? "");
  const tempolimitsRaw = String(formData.get("tempolimits") ?? "[]");
  const requestedPrivat = formData.get("ist_privat") === "true";

  if (!name) {
    return { error: "Bitte einen Namen für die Strecke angeben." };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.` };
  }
  if (!geometryRaw) {
    return { error: "Bitte mindestens zwei Wegpunkte auf der Karte setzen." };
  }
  if (!(laengeKm > 0)) {
    return { error: "Bitte eine gültige Länge in km angeben." };
  }

  const geometry = parseGeometry(geometryRaw);
  if (!geometry) {
    return { error: "Route konnte nicht verarbeitet werden." };
  }
  const tempolimits = parseTempolimits(tempolimitsRaw);
  if (!tempolimits) {
    return { error: "Route konnte nicht verarbeitet werden." };
  }

  // Start-/Zielort und Region kommen nicht mehr aus dem Formular, sondern
  // werden aus der gezeichneten Route abgeleitet (Reverse-Geocoding, inkl.
  // Rundfahrt-/Fallback-Behandlung) — siehe deriveRouteLocations() für die
  // Details, dort auch isoliert getestet.
  const { startOrt, zielOrt, region } = await deriveRouteLocations(geometry.coordinates);

  // Höhe/Steigung/Kehren automatisch aus der Geometrie ableiten (swisstopo-
  // Höhenprofil + Peilungsanalyse) — bei einem API-Ausfall lieber ohne diese
  // Werte veröffentlichen als den Vorschlag zu blockieren.
  let hoeheM: number | null = null;
  let maxSteigungProzent: number | null = null;
  let hoehenprofil: unknown = null;
  const kehren = countKehren(geometry.coordinates);
  const profile = await fetchElevationProfile(geometry.coordinates);
  if (profile) {
    const stats = computeHoeheUndSteigung(profile);
    hoeheM = stats.hoeheM;
    maxSteigungProzent = stats.maxSteigungProzent;
    hoehenprofil = buildHoehenprofil(profile);
  }

  // p_laenge_km is only a fast client-side plausibility check above
  // (laengeKm > 0) — propose_route_full (0033) recomputes and stores the
  // authoritative length itself from p_geometry_geojson via ST_Length,
  // so a mismatched or fabricated value here can't end up in the DB.
  const { data, error } = await supabase.rpc("propose_route_full", {
    p_name: name,
    p_region: region,
    p_start_ort: startOrt,
    p_ziel_ort: zielOrt,
    p_geometry_geojson: geometry,
    p_laenge_km: laengeKm,
    p_kategorien: kategorien,
    p_charakter_text: charakterText,
    p_tempolimits: tempolimits,
    p_hoehe_m: hoeheM,
    p_max_steigung_prozent: maxSteigungProzent,
    p_kehren: kehren,
    p_hoehenprofil: hoehenprofil,
  });

  if (error || !data) {
    // Race-freie Durchsetzung via DB-Trigger (0041) — der App-seitige Check
    // oben ist nur ein schnelles Vorab-Feedback und kann bei parallelen
    // Requests theoretisch durchrutschen.
    if (error?.message.includes("cooldown_active")) {
      return { error: "Bitte warte einen Moment, bevor du eine weitere Strecke erstellst." };
    }
    return { error: "Strecke konnte nicht gespeichert werden." };
  }

  // Kontingent für private Strecken (AGB Ziff. 3.2): kostenlos eine, mit
  // Premium unbegrenzt. Seit eigene Strecken selbst Premium sind (0077),
  // kommt hier ohne Abo praktisch nur noch die Moderation vorbei — für sie
  // gilt das Kontingent weiterhin, die Logik bleibt deshalb. Die
  // Entscheidung fällt in der Datenbank — darf_private_strecke_anlegen()
  // zählt und prüft in einem Aufruf, statt hier zu zählen und danach zu
  // schreiben.
  //
  // Die Prüfung steht bewusst NACH dem Anlegen: propose_route_full erzeugt
  // die Zeile, und erst danach lässt sich sagen, ob sie privat sein darf.
  // Wird das Kontingent überschritten, bleibt die Strecke bestehen — sie
  // geht dann als normaler Vorschlag in die Moderation, statt verloren zu
  // sein. Ein stiller Verlust der gerade gezeichneten Route wäre die
  // schlechtere Antwort auf ein erschöpftes Kontingent.
  if (requestedPrivat) {
    const kontingent = await privateStreckenKontingent();
    if (kontingent.erlaubt) {
      await supabase.from("routes").update({ ist_privat: true }).eq("id", data);
    } else {
      redirect(`/strecken/${data}?privat=kontingent`);
    }
  }

  redirect(`/strecken/${data}`);
}

// Nimmt eine private Strecke aus dem Premium-Feature "eigene Strecken" in die
// normale Moderationswarteschlange auf (ist_privat=false, status_ok bleibt
// false) — ab dann läuft sie wie jeder andere Vorschlag über approveRoute/
// rejectRoute. Verlässt sich auf die RLS-Policy "Nutzer können eigene
// unverifizierte Strecken bearbeiten" (0001_init.sql).
export async function publishPrivateRoute(routeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("routes")
    .update({ ist_privat: false })
    .eq("id", routeId)
    .eq("erstellt_von", user.id)
    .eq("status_ok", false);

  revalidatePath(`/strecken/${routeId}`);
  revalidatePath("/profil");
  revalidatePath("/moderation");
}

export interface DeleteRouteState {
  error: string | null;
}

// Verlässt sich auf die RLS-Policy "Nutzer können eigene abgelehnte
// Vorschläge löschen" (siehe 0012_eigene_abgelehnte_loeschen.sql) — ein
// Versuch auf eine fremde, bewilligte oder noch ausstehende Strecke betrifft
// schlicht 0 Zeilen betroffen statt einen Fehler zu werfen. Vorab-Check wie
// in completions.ts (z.B. removeCompletionPhoto), der dieselbe Bedingung wie
// die RLS-Policy spiegelt: ohne ihn würde ein solcher Zero-Row-Löschversuch
// fälschlich als Erfolg durchgehen statt dem Nutzer gemeldet zu werden.
export async function deleteOwnRejectedRoute(routeId: string): Promise<DeleteRouteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const { data: existing } = await supabase
    .from("routes")
    .select("id")
    .eq("id", routeId)
    .eq("erstellt_von", user.id)
    .not("abgelehnt_am", "is", null)
    .maybeSingle();

  if (!existing) return { error: "Strecke nicht gefunden." };

  const { error } = await supabase.from("routes").delete().eq("id", routeId);

  if (error) return { error: "Strecke konnte nicht gelöscht werden." };

  revalidatePath("/profil");
  return { error: null };
}

export interface UpdateRouteState {
  error: string | null;
}

// Bearbeitet nur die Metadaten eines eigenen, noch nicht bewilligten
// Vorschlags — der Streckenverlauf selbst (Geometrie/Länge/Tempolimits)
// bleibt unangetastet, da die ursprünglichen Wegpunkte nicht gespeichert
// werden und sich nicht verlustfrei aus der fertigen Route rekonstruieren
// lassen. Setzt abgelehnt_am zurück, damit ein überarbeiteter, zuvor
// abgelehnter Vorschlag wieder in der Moderationswarteschlange erscheint.
// Verlässt sich auf die RLS-Policy "Nutzer können eigene unverifizierte
// Strecken bearbeiten" (siehe 0001_init.sql).
export async function updateRoute(
  routeId: string,
  _prevState: UpdateRouteState,
  formData: FormData,
): Promise<UpdateRouteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const name = String(formData.get("name") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const startOrt = String(formData.get("start_ort") ?? "").trim();
  const zielOrt = String(formData.get("ziel_ort") ?? "").trim();
  const charakterText = String(formData.get("charakter_text") ?? "").trim() || null;
  const kategorien = formData.getAll("kategorien") as Kategorie[];

  if (!name || !region || !startOrt || !zielOrt) {
    return { error: "Bitte alle Pflichtfelder ausfüllen." };
  }

  const { error } = await supabase
    .from("routes")
    .update({
      name,
      region,
      start_ort: startOrt,
      ziel_ort: zielOrt,
      charakter_text: charakterText,
      kategorien,
      abgelehnt_am: null,
    })
    .eq("id", routeId)
    .eq("erstellt_von", user.id)
    .eq("status_ok", false);

  if (error) return { error: "Änderungen konnten nicht gespeichert werden." };

  revalidatePath(`/strecken/${routeId}`);
  revalidatePath("/profil");
  redirect(`/strecken/${routeId}`);
}

// Wie updateRoute, aber für Moderatoren: darf jede Strecke bearbeiten
// (unabhängig von Ersteller/Status) und rührt abgelehnt_am nicht an —
// verlässt sich auf die RLS-Policy "Moderatoren können alle Strecken
// freischalten" (siehe 0009_profil_erweiterungen.sql), die trotz ihres
// Namens ein uneingeschränktes UPDATE für Moderatoren erlaubt.
export async function updateRouteAsModerator(
  routeId: string,
  _prevState: UpdateRouteState,
  formData: FormData,
): Promise<UpdateRouteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isModerator(user.id))) {
    return { error: "Keine Berechtigung." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const startOrt = String(formData.get("start_ort") ?? "").trim();
  const zielOrt = String(formData.get("ziel_ort") ?? "").trim();
  const charakterText = String(formData.get("charakter_text") ?? "").trim() || null;
  const kategorien = formData.getAll("kategorien") as Kategorie[];

  if (!name || !region || !startOrt || !zielOrt) {
    return { error: "Bitte alle Pflichtfelder ausfüllen." };
  }

  const { error } = await supabase
    .from("routes")
    .update({
      name,
      region,
      start_ort: startOrt,
      ziel_ort: zielOrt,
      charakter_text: charakterText,
      kategorien,
    })
    .eq("id", routeId);

  if (error) return { error: "Änderungen konnten nicht gespeichert werden." };

  revalidatePath(`/strecken/${routeId}`);
  revalidatePath("/");
  revalidatePath("/moderation");
  redirect(`/strecken/${routeId}`);
}

// Verlässt sich auf die RLS-Policy "Moderatoren können Strecken ablehnen
// (löschen)" (siehe 0009_profil_erweiterungen.sql), die trotz ihres Namens
// ein uneingeschränktes DELETE für Moderatoren erlaubt — unabhängig davon,
// ob die Strecke bereits bewilligt ist.
export async function deleteRouteAsModerator(routeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isModerator(user.id))) return;

  await supabase.from("routes").delete().eq("id", routeId);
  revalidatePath("/");
  revalidatePath("/moderation");
  redirect("/");
}
