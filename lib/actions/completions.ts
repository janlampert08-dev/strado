"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rateLimit";
import { computeRouteCoverage, COVERAGE_THRESHOLD_PERCENT } from "@/lib/routeCoverage";
import { computeTrailStats, type TrailPoint } from "@/lib/geo";
import { bewerteBewegungsprofil } from "@/lib/bewegungsprofil";
import {
  MAX_JUMP_KM,
  MAX_RIDE_SECONDS,
  MAX_TRAIL_POINTS,
  maxJumpKm,
  movingSeconds,
  publicationBlockReason,
  simplifyTrack,
  toCoordinates,
  toEwktLineString,
} from "@/lib/track";
import { metadatenEntfernen } from "@/lib/imageMetadata";
import { istPremium, maxFotosProFahrt } from "@/lib/premium";
import { publicTrackEwkt } from "@/lib/publicTrack";
import {
  buildHoehenprofil,
  computeAscentM,
  fetchElevationProfile,
  stuetzpunkteFuer,
} from "@/lib/elevation";
import { reverseGeocode } from "@/lib/geocoding";
import {
  getRoute,
  listRouteDetectionCandidates,
  type RouteDetectionCandidate,
} from "@/lib/routes";
import { todayInZurich } from "@/lib/format";
import { detectLaps, type DetectedLap, type RouteCandidate } from "@/lib/lapDetection";
import { bildEndungFuerMime } from "@/lib/validation";

export interface CompletionFormState {
  error: string | null;
  // Bei Erfolg die ID der neu angelegten Fahrt, damit der Client auf ihre
  // Detailseite wechseln kann (Teilen, Kudos, Fotogalerie) statt den
  // Fazit-Screen nur zu schliessen — dieselbe Weiterleitung wie bei einer
  // freien Fahrt, siehe FreeRideFormState.
  completionId?: string;
}

const ROUTE_PHOTOS_BUCKET = "route-photos";
const MAX_FOTO_BYTES = 8 * 1024 * 1024;
const COMPLETION_COOLDOWN_MS = 5000;
const MAX_NOTIZ_LENGTH = 280;
// Gleiche Grenze wie der CHECK auf route_completions.titel (0044).
const MAX_TITEL_LENGTH = 80;
const MIN_TRAIL_POINTS = 5;
// Fotos pro Fahrt: 6 kostenlos, 12 mit Premium — die Werte stehen als
// benannte Konstanten in lib/premium.ts, nicht hier. Grosszügig genug für
// eine echte Fahrt (mehrere Stopps unterwegs), aber begrenzt genug um
// Storage-Missbrauch über ein einzelnes Formular zu verhindern; siehe
// MAX_FOTO_BYTES für dieselbe Überlegung pro Datei.
//
// Die Grenze wird HIER durchgesetzt, nicht im Formular. MultiPhotoInput
// zeigt dieselbe Zahl an, aber eine Clientgrenze ist eine Anzeigehilfe:
// wer das Formular selbst zusammenbaut, schickt so viele Dateien, wie er
// will. Der slice() unten ist die Schranke.

// Grosszügige Obergrenze für die aus Distanz/Dauer abgeleitete
// Durchschnittsgeschwindigkeit — auch auf einer freigegebenen Passstrasse
// unrealistisch, deckt aber jede legitime Fahrt ab. Fängt grob gefälschte
// Trails (z.B. wenige, weit auseinanderliegende Punkte) ab, ohne echte
// GPS-Ungenauigkeit zu bestrafen.
const MAX_PLAUSIBLE_KMH = 200;

// Rohdaten des Clients: der aufgezeichnete GPS-Trail. Alle Kennzahlen einer
// Fahrt werden ausschliesslich hieraus abgeleitet — vom Client mitgeschickte
// Distanzen/Zeiten/Deckungsgrade wären beliebig fälschbar.
function parseTrail(formData: FormData): { trail: TrailPoint[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("trail") ?? "[]"));
  } catch {
    return { error: "Ungültige Tracking-Daten." };
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (p) =>
        p && typeof p.lng === "number" && typeof p.lat === "number" && typeof p.t === "number",
    )
  ) {
    return { error: "Ungültige Tracking-Daten." };
  }

  // Zu wenige Punkte heisst in aller Regel: die Aufzeichnung wurde nach
  // wenigen Sekunden beendet. Das ist kein Fehler des Nutzers und verdient
  // eine Erklärung statt "ungültige Daten".
  if (parsed.length < MIN_TRAIL_POINTS) {
    return { error: "Die Aufzeichnung ist zu kurz, um gespeichert zu werden." };
  }
  if (parsed.length > MAX_TRAIL_POINTS) {
    return { error: "Die Aufzeichnung enthält zu viele Punkte." };
  }

  // Die Zeitstempel müssen aufsteigen. Ein rückwärts laufender Punkt ist
  // aus einer echten Aufzeichnung nicht zu erklären, für die abgeleiteten
  // Kennzahlen aber folgenreich: movingSeconds summiert die Differenzen
  // zwischen benachbarten Punkten, ein negativer Schritt zieht die
  // Bewegtzeit also nach unten und im Extremfall unter null. Genau das
  // verbietet der Constraint fahrt_bewegtzeit_plausibel (0074) — ohne
  // diese Prüfung bekäme der Nutzer dafür einen rohen Datenbankfehler
  // statt einer Erklärung, und ein Direktschreiber liesse sich davon
  // ohnehin nicht beeindrucken.
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].t < parsed[i - 1].t) {
      return { error: "Die Aufzeichnung enthält Zeitsprünge rückwärts." };
    }
  }

  return { trail: parsed as TrailPoint[] };
}

// Plausibilitätsprüfungen, die für jede Aufzeichnung gelten — unabhängig
// davon, ob sie zu einer Strecke gehört. Bei Streckenfahrten kommt der
// Deckungsgrad als zusätzlicher Anker dazu (computeRouteCoverage); eine
// freie Fahrt hat keinen solchen Anker, für sie sind diese Regeln die
// einzige Prüfung.
function implausibilityReason(
  trail: TrailPoint[],
  distanzKm: number,
  dauerSekunden: number,
): string | null {
  if (!(distanzKm > 0) || dauerSekunden <= 0) return "Ungültige Tracking-Daten.";

  // Bewegungsprofil: stammt die Bewegung überhaupt von einem
  // Strassenfahrzeug, oder sieht sie nach Bahn/Flug aus (siehe
  // lib/bewegungsprofil.ts)? Bewusst hier und nicht nur im Client: der
  // Client-Hinweis ist Komfort, diese Stelle ist die Kontrolle. Sie sitzt in
  // implausibilityReason, weil damit beide Speicherwege (Streckenfahrt und
  // freie Fahrt) und auch die automatisch erkannten Streckenabschnitte
  // innerhalb einer freien Fahrt dieselbe Prüfung durchlaufen.
  //
  // NEUE GESCHÄFTSREGEL: Fahrten können dadurch abgelehnt werden — aber nur
  // die eindeutigen. Abgewiesen wird ausschliesslich, was `blockiert` setzt,
  // heute also der Flug. Das Bahn-Verdikt warnt im Client und kommt hier
  // bewusst nicht an: seine Bedingungen erfüllt auch eine kurvenfreie Etappe
  // auf einer unbegrenzten Autobahn, und eine echte Fahrt abzulehnen wiegt
  // schwerer als ein Zug in der Liste. Im Zweifel (zu kurze/dünne
  // Aufzeichnung) fällt ohnehin kein Urteil.
  //
  // Steht vor der Tempoprüfung, weil diese Begründung die genauere ist: ein
  // Flug reisst auch MAX_PLAUSIBLE_KMH (200), und stünde die Tempoprüfung
  // davor, bekäme praktisch jeder Flug das allgemeine "Unrealistische
  // Durchschnittsgeschwindigkeit erkannt." statt der Erklärung, die die
  // Formulare live schon anzeigen. Am Ergebnis ändert die Reihenfolge
  // nichts — beide Wege lehnen ab; sie entscheidet nur, was der Nutzer liest.
  const bewegung = bewerteBewegungsprofil(trail);
  if (bewegung.blockiert && bewegung.begruendung) return bewegung.begruendung;

  if (distanzKm / (dauerSekunden / 3600) > MAX_PLAUSIBLE_KMH) {
    return "Unrealistische Durchschnittsgeschwindigkeit erkannt.";
  }
  if (dauerSekunden > MAX_RIDE_SECONDS) {
    return "Diese Aufzeichnung ist unrealistisch lang — wurde sie vielleicht nicht beendet?";
  }
  if (maxJumpKm(trail) > MAX_JUMP_KM) {
    return "Die Aufzeichnung enthält eine zu grosse Lücke zwischen zwei Punkten.";
  }

  return null;
}

async function uploadFoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  foto: File,
): Promise<{ url: string } | { error: string }> {
  if (foto.size > MAX_FOTO_BYTES) {
    return { error: "Foto ist zu gross (max. 8 MB)." };
  }

  // Endung aus dem Content-Type statt aus foto.name — Begründung in
  // lib/validation.ts. Ersetzt zugleich die alte
  // type.startsWith("image/")-Prüfung, die image/svg+xml durchgelassen hat.
  const ext = bildEndungFuerMime(foto.type);
  if (!ext) {
    return { error: "Nur JPG-, PNG-, WebP- oder GIF-Bilder sind erlaubt." };
  }
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  // Metadaten entfernen, bevor die Datei den Server verlässt. Ein Foto vom
  // Handy trägt sonst Aufnahmeort und -zeitpunkt im EXIF-Block mit sich — bei
  // einer Plattform für gefahrene Strecken heisst das im Zweifel die
  // Heimadresse, und zwar auch dann, wenn die Fahrt privat bleibt und der
  // Track an den Enden gekappt wurde.
  const bereinigt = metadatenEntfernen(new Uint8Array(await foto.arrayBuffer()), foto.type);

  const { error } = await supabase.storage
    .from(ROUTE_PHOTOS_BUCKET)
    // contentType muss hier mit, weil ein Uint8Array — anders als ein File —
    // seinen Typ nicht selbst mitbringt; ohne die Angabe landete die Datei
    // als application/octet-stream im Bucket und würde von der
    // MIME-Beschränkung aus 0033 abgelehnt.
    .upload(path, bereinigt, { contentType: foto.type });
  if (error) return { error: "Foto konnte nicht hochgeladen werden." };
  const { data } = supabase.storage.from(ROUTE_PHOTOS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

// Best-effort-Aufräumen bereits hochgeladener Storage-Objekte, wenn ein
// späterer Schritt (weiterer Upload, die Fahrt selbst, oder die
// completion_photos-Zeilen) fehlschlägt — sonst blieben die Dateien ohne
// referenzierende Zeile verwaist im Bucket liegen.
async function removeUploadedFotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  urls: string[],
): Promise<void> {
  const bucketMarker = `/${ROUTE_PHOTOS_BUCKET}/`;
  const paths = urls
    .map((url) => {
      const markerIndex = url.indexOf(bucketMarker);
      return markerIndex === -1 ? null : url.slice(markerIndex + bucketMarker.length);
    })
    .filter((path): path is string => path !== null);
  if (paths.length > 0) {
    await supabase.storage.from(ROUTE_PHOTOS_BUCKET).remove(paths);
  }
}

// Lädt alle Fotos eines Formulars hoch, bevor die Fahrt selbst gespeichert
// wird: schlägt eine Datei fehl (Format/Grösse), soll gar keine halbe Fahrt
// ohne ihre Fotos entstehen. Bereits hochgeladene Dateien dieses Versuchs
// werden dabei wieder entfernt statt verwaist im Bucket liegen zu bleiben.
async function uploadFotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fotos: File[],
): Promise<{ urls: string[] } | { error: string }> {
  const urls: string[] = [];
  for (const foto of fotos) {
    const result = await uploadFoto(supabase, userId, foto);
    if ("error" in result) {
      await removeUploadedFotos(supabase, urls);
      return { error: result.error };
    }
    urls.push(result.url);
  }
  return { urls };
}

// Verknüpft hochgeladene Fotos mit der bereits gespeicherten Fahrt. Ein
// Fehler hier führt bewusst NICHT zu einem Fehler-Return beim Aufrufer (das
// würde den Nutzer zu einem erneuten Absenden verleiten und eine doppelte
// Fahrt anlegen). Best effort: die hochgeladenen Dateien ohne
// referenzierende Zeile wieder entfernen.
async function attachPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  completionId: string,
  userId: string,
  urls: string[],
): Promise<void> {
  if (urls.length === 0) return;
  const { error } = await supabase.from("completion_photos").insert(
    urls.map((foto_url, position) => ({
      completion_id: completionId,
      user_id: userId,
      foto_url,
      position,
    })),
  );
  if (error) await removeUploadedFotos(supabase, urls);
}

// Speichert eine per Live-GPS-Tracking erfasste Fahrt — der einzige Weg,
// eine Strecke als "gefahren" einzutragen (kein manueller Eintrag ohne GPS
// mehr, siehe Entfernung von logCompletion/CompletionForm). dauer_sekunden
// ist dadurch immer gesetzt, bleibt aber standardmässig privat (RLS erlaubt
// ohnehin nur den Zugriff auf eigene Einträge) — ob die Fahrt auf
// Bestenlisten/öffentlichem Profil erscheint, entscheidet der Nutzer pro
// Fahrt im Fazit-Screen (ist_oeffentlich, siehe 0017_pro_fahrt_sichtbarkeit.sql).
export async function logTrackedCompletion(
  routeId: string,
  _prevState: CompletionFormState,
  formData: FormData,
): Promise<CompletionFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  if (
    await isRateLimited(
      supabase,
      "route_completions",
      "created_at",
      "user_id",
      user.id,
      COMPLETION_COOLDOWN_MS,
    )
  ) {
    return { error: "Bitte warte einen Moment, bevor du erneut einträgst." };
  }

  const fahrzeugId = String(formData.get("fahrzeug_id") ?? "") || null;
  const requestedOeffentlich = formData.get("ist_oeffentlich") === "true";
  const notizRaw = String(formData.get("notiz") ?? "").trim();
  const notiz = notizRaw ? notizRaw.slice(0, MAX_NOTIZ_LENGTH) : null;
  const fotos = formData
    .getAll("foto")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, maxFotosProFahrt(await istPremium()));

  // distanz_km/dauer_sekunden/abdeckung_prozent kommen NICHT vom Client —
  // die liessen sich beliebig fälschen (z.B. abdeckung_prozent=100,
  // dauer_sekunden=1 ohne je gefahren zu sein). Stattdessen wird alles aus
  // dem rohen GPS-Trail neu berechnet, denselben Algorithmen wie im Client
  // (für sofortiges UI-Feedback im Fazit-Screen), aber hier als einzige
  // massgebliche Quelle für Bestenlisten/Statistiken.
  const parsedTrail = parseTrail(formData);
  if ("error" in parsedTrail) return { error: parsedTrail.error };
  const trail = parsedTrail.trail;

  const route = await getRoute(routeId);
  if (!route) return { error: "Strecke nicht gefunden." };

  const { distanceKm: distanzKm, durationSeconds: dauerSekunden } = computeTrailStats(trail);
  const abdeckungProzent = computeRouteCoverage(
    route.geometry_geojson.coordinates as [number, number][],
    trail.map((p) => [p.lng, p.lat] as [number, number]),
  );

  const implausible = implausibilityReason(trail, distanzKm, dauerSekunden);
  if (implausible) return { error: implausible };

  // Serverseitig erzwungen, nicht nur im UI verhindert: unabhängig davon, was
  // das Formular schickt, kann eine Fahrt unterhalb des Deckungsgrad-
  // Schwellenwerts nicht öffentlich sein (siehe lib/routeCoverage.ts).
  const istOeffentlich = requestedOeffentlich && abdeckungProzent >= COVERAGE_THRESHOLD_PERCENT;

  const streckenKoordinaten = toCoordinates(simplifyTrack(trail));

  // Fotos hochladen und Höhenmeter ableiten sind unabhängige externe
  // Aufrufe (Storage bzw. swisstopo) — parallel statt nacheinander, gleiches
  // Muster wie bei der freien Fahrt weiter unten (deriveElevation).
  const [uploaded, elevation] = await Promise.all([
    uploadFotos(supabase, user.id, fotos),
    deriveElevation(streckenKoordinaten),
  ]);
  if ("error" in uploaded) return { error: uploaded.error };
  const uploadedUrls = uploaded.urls;

  const { data: inserted, error } = await supabase
    .from("route_completions")
    .insert({
      route_id: routeId,
      user_id: user.id,
      fahrzeug_id: fahrzeugId,
      // Lokales Kalenderdatum (Europe/Zurich), nicht UTC — sonst würde eine
      // Fahrt kurz nach Mitternacht Ortszeit fälschlich auf den Vortag
      // gestempelt (siehe todayInZurich in lib/format.ts).
      datum: todayInZurich(),
      distanz_km: distanzKm,
      dauer_sekunden: dauerSekunden,
      // Reine Bewegtzeit ohne Pausen — für eine Passfahrt am Stück fast
      // identisch mit dauer_sekunden, aber dieselbe Berechnung für beide
      // Fahrtarten (siehe 0044_freie_fahrten.sql).
      bewegte_zeit_sekunden: movingSeconds(trail),
      art: "strecke",
      ist_oeffentlich: istOeffentlich,
      abdeckung_prozent: abdeckungProzent,
      notiz,
      // Seit 0054_freie_fahrten_in_bestenlisten.sql zählen Streckenfahrten
      // in der Höhenmeter-Bestenliste über denselben kumulierten Anstieg
      // wie freie Fahrten (statt der Scheitelhöhe der Strecke) — deshalb
      // hier ab jetzt ebenfalls berechnet, nicht mehr nur bei logFreeRide.
      hoehenmeter_aufstieg: elevation.hoehenmeter_aufstieg,
      // Ab 0044 wird der gefahrene Track gespeichert statt nach der
      // Berechnung verworfen — vereinfacht (die Kennzahlen oben stammen
      // weiterhin aus den Rohpunkten). Nur für den Besitzer lesbar.
      track: toEwktLineString(streckenKoordinaten),
      // Die gekappte Fassung entsteht nur, wenn die Fahrt auch wirklich
      // geteilt wird (0045) — eine private Fahrt hinterlässt keine
      // öffentliche Geometrie.
      track_oeffentlich: istOeffentlich
        ? await publicTrackEwkt(supabase, user.id, streckenKoordinaten)
        : null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    await removeUploadedFotos(supabase, uploadedUrls);
    // Race-freie Durchsetzung via DB-Trigger (0024) — der App-seitige Check
    // oben ist nur ein schnelles Vorab-Feedback und kann bei parallelen
    // Requests theoretisch durchrutschen.
    if (error?.message.includes("cooldown_active")) {
      return { error: "Bitte warte einen Moment, bevor du erneut einträgst." };
    }
    return { error: "Fahrt konnte nicht gespeichert werden." };
  }

  await attachPhotos(supabase, inserted.id, user.id, uploadedUrls);

  revalidatePath(`/strecken/${routeId}`);
  revalidatePath("/profil");
  revalidatePath("/leaderboards");
  return { error: null, completionId: inserted.id };
}

export interface FreeRideFormState {
  error: string | null;
  // Bei Erfolg die ID der neu angelegten Fahrt, damit der Client direkt auf
  // ihre Detailseite wechseln kann (anders als bei einer Streckenfahrt gibt
  // es keine Streckenseite, zu der man zurückkehren könnte).
  completionId?: string;
  // Innerhalb dieser Fahrt automatisch erkannte Streckenabschnitte (siehe
  // lib/lapDetection.ts) — für den Fazit-Screen, der sie als eigene Karten
  // mit eigenem Sichtbarkeits-Toggle anzeigt. Leer im ganz überwiegenden
  // Fall (keine hinterlegte Strecke vollständig abgedeckt).
  segments?: (DetectedSegmentSummary & { id: string })[];
  // Strecken, die spürbar, aber nicht vollständig abgefahren wurden —
  // rein informativ ("fast geschafft"), keine eigene Fahrt, nichts
  // Gespeichertes. Der Fazit-Screen zeigt das kurz an, bevor er wie gewohnt
  // auf die neue Fahrt weiterleitet.
  partialAttempts?: PartialAttemptSummary[];
}

// Höhenprofil und Anstieg einer Fahrt (frei oder Strecke), best effort: der
// swisstopo-Dienst kennt nur Schweizer Koordinaten und kann ausfallen.
// Beides ist Beiwerk — eine Fahrt darf daran nicht scheitern, deshalb
// ausdrücklich abgefangen statt den Speichervorgang mitzureissen. Bei
// Streckenfahrten wird nur hoehenmeter_aufstieg verwendet (Bestenliste,
// siehe 0054_freie_fahrten_in_bestenlisten.sql) — das Höhenprofil-Diagramm
// zeigt dort weiterhin routes.hoehenprofil (app/fahrten/[id]/page.tsx).
async function deriveElevation(
  coordinates: [number, number][],
): Promise<{ hoehenmeter_aufstieg: number | null; hoehenprofil: { km: number; m: number }[] | null }> {
  try {
    // Stützpunktdichte an die Länge gekoppelt statt fest bei 300: sonst
    // untermeldet der summierte Anstieg lange Fahrten drastisch, und die
    // Höhenmeter-Bestenliste belohnt das Zerschneiden einer langen Fahrt.
    // Streckenkennzahlen bleiben davon unberührt — Begründung in
    // lib/elevation.ts.
    const profile = await fetchElevationProfile(coordinates, stuetzpunkteFuer(coordinates));
    if (!profile || profile.length < 2) {
      return { hoehenmeter_aufstieg: null, hoehenprofil: null };
    }
    return {
      hoehenmeter_aufstieg: computeAscentM(profile),
      hoehenprofil: buildHoehenprofil(profile),
    };
  } catch {
    return { hoehenmeter_aufstieg: null, hoehenprofil: null };
  }
}

export interface DetectedSegmentSummary {
  routeId: string;
  routeName: string;
  distanzKm: number;
  dauerSekunden: number;
}

export interface PartialAttemptSummary {
  routeId: string;
  routeName: string;
  percent: number;
}

// Unterhalb dieses Fortschritts wird ein nicht geschlossener Rundenversuch
// gar nicht erst als Hinweis zurückgegeben — reiner UI-Schwellenwert, ohne
// Einfluss auf die eigentliche Erkennung.
const MIN_PARTIAL_HINT_FRACTION = 0.3;

interface DetectedSegmentPayload {
  route_id: string;
  distanz_km: number;
  dauer_sekunden: number;
  bewegte_zeit_sekunden: number;
  abdeckung_prozent: number;
  track: string | null;
}

// Muss zum v_max_segments-Limit der RPC-Funktion in
// 0050_streckenerkennung_in_freier_fahrt.sql passen. Ohne diese Kappung
// hier würde ein Trail mit mehr Treffern die gesamte Fahrt zu Fall bringen
// (save_free_ride_with_segments ist atomar) statt nur die überzähligen
// Segmente zu verwerfen.
const MAX_DETECTED_SEGMENTS = 20;

// Wandelt die von lib/lapDetection.ts erkannten Zeitfenster in fertige
// Segment-Datensätze um. lapDetection kennt nur den (vereinfachten) Trail
// und liefert reine Zeitfenster (entryT/exitT) zurück — die eigentlichen
// Kennzahlen werden hier, genau wie bei einer regulär gestarteten
// Streckenfahrt, aus dem ROHEN Trail-Ausschnitt neu berechnet: dieselbe
// Präzision, dieselben Plausibilitäts- und Deckungsgrad-Prüfungen wie bei
// logTrackedCompletion — ein erkanntes Fenster, das diese Prüfungen nicht
// besteht, wird stillschweigend verworfen (bewusst: eine verpasste
// Erkennung kostet nichts, eine fälschlich vergebene Fahrt schon, siehe
// PR-Beschreibung).
function buildDetectedSegments(
  trail: TrailPoint[],
  laps: DetectedLap[],
  candidates: RouteDetectionCandidate[],
): { payloads: DetectedSegmentPayload[]; summaries: DetectedSegmentSummary[] } {
  const payloads: DetectedSegmentPayload[] = [];
  const summaries: DetectedSegmentSummary[] = [];

  for (const lap of laps) {
    if (payloads.length >= MAX_DETECTED_SEGMENTS) break;

    const route = candidates.find((r) => r.id === lap.routeId);
    if (!route) continue;

    const subTrail = trail.filter((p) => p.t >= lap.entryT && p.t <= lap.exitT);
    if (subTrail.length < MIN_TRAIL_POINTS) continue;

    const { distanceKm, durationSeconds } = computeTrailStats(subTrail);
    if (implausibilityReason(subTrail, distanceKm, durationSeconds)) continue;

    const abdeckungProzent = computeRouteCoverage(
      route.geometry_geojson.coordinates as [number, number][],
      subTrail.map((p) => [p.lng, p.lat] as [number, number]),
    );
    // Zweites, unabhängiges Signal zusätzlich zum geordneten Rundenschluss
    // aus lapDetection — beide müssen zustimmen (siehe PR-Beschreibung).
    if (abdeckungProzent < COVERAGE_THRESHOLD_PERCENT) continue;

    payloads.push({
      route_id: route.id,
      distanz_km: distanceKm,
      dauer_sekunden: durationSeconds,
      bewegte_zeit_sekunden: movingSeconds(subTrail),
      abdeckung_prozent: abdeckungProzent,
      track: toEwktLineString(toCoordinates(simplifyTrack(subTrail))),
    });
    summaries.push({ routeId: route.id, routeName: route.name, distanzKm: distanceKm, dauerSekunden: durationSeconds });
  }

  return { payloads, summaries };
}

// Speichert eine freie Fahrt: dieselbe Aufzeichnung wie bei einer Strecke,
// nur ohne Streckenbezug (siehe 0044_freie_fahrten.sql). Es gibt damit auch
// keinen Deckungsgrad als Echtheitsanker — an seine Stelle treten die
// Plausibilitätsregeln in implausibilityReason().
//
// Ob die Fahrt geteilt wird, entscheidet der Nutzer im Fazit-Screen. An die
// Stelle des Deckungsgrads tritt dabei publicationBlockReason() — dieselbe
// Funktion, mit der das Formular die Auswahl ausgraut, hier serverseitig
// erzwungen: unabhängig davon, was das Formular schickt, wird eine zu kurze
// Fahrt nur privat gespeichert.
export async function logFreeRide(
  _prevState: FreeRideFormState,
  formData: FormData,
): Promise<FreeRideFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  if (
    await isRateLimited(
      supabase,
      "route_completions",
      "created_at",
      "user_id",
      user.id,
      COMPLETION_COOLDOWN_MS,
    )
  ) {
    return { error: "Bitte warte einen Moment, bevor du erneut einträgst." };
  }

  const parsedTrail = parseTrail(formData);
  if ("error" in parsedTrail) return { error: parsedTrail.error };
  const trail = parsedTrail.trail;

  const { distanceKm: distanzKm, durationSeconds: dauerSekunden } = computeTrailStats(trail);
  const implausible = implausibilityReason(trail, distanzKm, dauerSekunden);
  if (implausible) return { error: implausible };

  const bewegteSekunden = movingSeconds(trail);
  const istOeffentlich =
    formData.get("ist_oeffentlich") === "true" &&
    publicationBlockReason(distanzKm, bewegteSekunden) === null;

  const fahrzeugId = String(formData.get("fahrzeug_id") ?? "") || null;
  const titelRaw = String(formData.get("titel") ?? "").trim();
  const titel = titelRaw ? titelRaw.slice(0, MAX_TITEL_LENGTH) : null;
  const notizRaw = String(formData.get("notiz") ?? "").trim();
  const notiz = notizRaw ? notizRaw.slice(0, MAX_NOTIZ_LENGTH) : null;
  const fotos = formData
    .getAll("foto")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, maxFotosProFahrt(await istPremium()));

  // Einmal berechnet, für die gespeicherte Track-Geometrie und die
  // Streckenerkennung weiter unten gemeinsam genutzt — Douglas-Peucker auf
  // demselben, potenziell mehrere tausend Punkte grossen Trail zweimal
  // laufen zu lassen wäre unnötige Arbeit.
  const simplifiedTrail = simplifyTrack(trail);
  const coordinates = toCoordinates(simplifiedTrail);
  const track = toEwktLineString(coordinates);
  if (!track) return { error: "Ungültige Tracking-Daten." };

  // Ortsbezug und Höhendaten parallel — beide sind externe Aufrufe, die die
  // Antwortzeit sonst nacheinander verlängern würden.
  const [ort, elevation] = await Promise.all([
    reverseGeocode(coordinates[0]).catch(() => null),
    deriveElevation(coordinates),
  ]);

  const uploaded = await uploadFotos(supabase, user.id, fotos);
  if ("error" in uploaded) return { error: uploaded.error };

  // Automatische Streckenerkennung: läuft auf dem bereits vereinfachten
  // Trail (gleiche Vereinfachung wie für die gespeicherte Track-Geometrie
  // oben), die eigentlichen Kennzahlen pro Treffer kommen aber wieder aus
  // dem rohen Trail (siehe buildDetectedSegments). Ein Fehler bei der
  // Kandidatensuche darf die freie Fahrt selbst nicht gefährden — best
  // effort, wie Ortsbezug/Höhenprofil oben.
  let segmentPayloads: DetectedSegmentPayload[] = [];
  let segmentSummaries: DetectedSegmentSummary[] = [];
  let partialAttemptSummaries: PartialAttemptSummary[] = [];
  try {
    const candidates = await listRouteDetectionCandidates(user.id);
    if (candidates.length > 0) {
      const routeCandidates: RouteCandidate[] = candidates.map((r) => ({
        routeId: r.id,
        coordinates: r.geometry_geojson.coordinates,
        isLoop: r.ist_rundfahrt,
      }));
      const { laps, partialAttempts } = detectLaps(simplifiedTrail, routeCandidates);
      const built = buildDetectedSegments(trail, laps, candidates);
      segmentPayloads = built.payloads;
      segmentSummaries = built.summaries;

      // Rein informativ ("fast geschafft"), keine Fahrt und nichts, das
      // gespeichert wird — nur ab einem gewissen Fortschritt zeigen, sonst
      // wäre jede zufällig gekreuzte Strecke eine Meldung wert.
      partialAttemptSummaries = partialAttempts
        .filter((p) => p.maxProgressFraction >= MIN_PARTIAL_HINT_FRACTION)
        .map((p) => ({
          routeId: p.routeId,
          routeName: candidates.find((r) => r.id === p.routeId)?.name ?? "Strecke",
          percent: Math.round(p.maxProgressFraction * 100),
        }));
    }
  } catch (detectionError) {
    console.error("Streckenerkennung fehlgeschlagen:", detectionError);
  }

  const freiPayload = {
    fahrzeug_id: fahrzeugId,
    datum: todayInZurich(),
    distanz_km: distanzKm,
    dauer_sekunden: dauerSekunden,
    bewegte_zeit_sekunden: bewegteSekunden,
    ist_oeffentlich: istOeffentlich,
    titel,
    notiz,
    start_ort: ort?.ort ?? null,
    region: ort?.region ?? null,
    hoehenmeter_aufstieg: elevation.hoehenmeter_aufstieg,
    hoehenprofil: elevation.hoehenprofil,
    track,
    track_oeffentlich: istOeffentlich
      ? await publicTrackEwkt(supabase, user.id, coordinates)
      : null,
  };

  let { data: insertedRaw, error } = await supabase.rpc("save_free_ride_with_segments", {
    p_frei: freiPayload,
    p_segments: segmentPayloads,
  });

  // save_free_ride_with_segments ist atomar — ein Fehler bei irgendeinem
  // Segment (z.B. route_not_eligible durch eine seltene Race zwischen
  // Kandidatenauswahl und Insert: die Strecke wurde in der Zwischenzeit
  // privat gesetzt/zurückgezogen) würde sonst auch die längst gültige
  // freie Fahrt mit zu Fall bringen. Erkennung ist best effort, die Fahrt
  // selbst nicht — deshalb hier einmal ohne Segmente erneut versuchen,
  // statt die ganze Aufzeichnung zu verlieren.
  if (
    error &&
    segmentPayloads.length > 0 &&
    /route_not_eligible|too_many_segments/.test(error.message)
  ) {
    console.error("Segmentpersistenz fehlgeschlagen, speichere ohne Segmente:", error.message);
    segmentSummaries = [];
    ({ data: insertedRaw, error } = await supabase.rpc("save_free_ride_with_segments", {
      p_frei: freiPayload,
      p_segments: [],
    }));
  }

  const inserted = insertedRaw as
    | { out_id: string; out_art: "frei" | "strecke"; out_route_id: string | null }[]
    | null;
  const parentRow = inserted?.find((row) => row.out_art === "frei");

  if (error || !parentRow) {
    await removeUploadedFotos(supabase, uploaded.urls);
    // Race-freie Durchsetzung via DB-Trigger (0024) — der App-seitige Check
    // oben ist nur ein schnelles Vorab-Feedback.
    if (error?.message.includes("cooldown_active")) {
      return { error: "Bitte warte einen Moment, bevor du erneut einträgst." };
    }
    return { error: "Fahrt konnte nicht gespeichert werden." };
  }

  await attachPhotos(supabase, parentRow.out_id, user.id, uploaded.urls);

  // Reihenfolge der 'strecke'-Zeilen entspricht der Reihenfolge von
  // p_segments (save_free_ride_with_segments verarbeitet sie in einer
  // einfachen sequenziellen Schleife über jsonb_array_elements) — Zippen mit
  // den in TypeScript berechneten Zusammenfassungen ist damit sicher.
  const segmentRows = (inserted ?? []).filter((row) => row.out_art === "strecke");
  const segments = segmentRows.map((row, i) => ({ id: row.out_id, ...segmentSummaries[i] }));

  revalidatePath("/profil");
  if (istOeffentlich) {
    revalidatePath("/feed");
    revalidatePath(`/fahrer/${user.id}`);
  }
  return {
    error: null,
    completionId: parentRow.out_id,
    segments,
    partialAttempts: partialAttemptSummaries,
  };
}

export interface DeleteCompletionState {
  error: string | null;
}

// Fahrt endgültig löschen. Bis hierhin liess sich eine Fahrt nur auf privat
// stellen — bei einer freien Fahrt ist das zu wenig: wer versehentlich den
// Arbeitsweg aufgezeichnet hat, will die Aufzeichnung (und damit den
// gespeicherten GPS-Track) los sein, nicht nur unsichtbar.
//
// Die Fotozeilen (completion_photos) und Kudos verschwinden per FK-Cascade;
// die Storage-Objekte selbst müssen ausdrücklich entfernt werden, sonst
// bleiben sie verwaist im Bucket zurück.
export async function deleteCompletion(completionId: string): Promise<DeleteCompletionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const { data: existing } = await supabase
    .from("route_completions")
    .select("id, route_id")
    .eq("id", completionId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; route_id: string | null }>();

  if (!existing) return { error: "Fahrt nicht gefunden." };

  const { data: photos } = await supabase
    .from("completion_photos")
    .select("foto_url")
    .eq("completion_id", completionId)
    .eq("user_id", user.id)
    .returns<{ foto_url: string }[]>();

  const { error } = await supabase
    .from("route_completions")
    .delete()
    .eq("id", completionId)
    .eq("user_id", user.id);

  if (error) return { error: "Fahrt konnte nicht gelöscht werden." };

  // Erst nach dem erfolgreichen Löschen der Zeile: schlägt das Entfernen der
  // Dateien fehl, bleiben sie zwar verwaist zurück, aber es steht keine
  // Fahrt mehr da, deren Fotos plötzlich fehlen.
  await removeUploadedFotos(supabase, (photos ?? []).map((p) => p.foto_url));

  revalidatePath("/profil");
  revalidatePath(`/fahrer/${user.id}`);
  revalidatePath("/feed");
  if (existing.route_id) revalidatePath(`/strecken/${existing.route_id}`);
  revalidatePath("/leaderboards");
  return { error: null };
}

export interface ToggleVisibilityState {
  error: string | null;
}

// Symbol-Umschalter unter "Getrackte Fahrten" im Profil — ändert die
// Sichtbarkeit einer bereits gespeicherten Fahrt nachträglich, ohne den
// Umweg über den Fazit-Screen (RLS erlaubt Update ohnehin nur der eigenen Zeile).
export async function toggleCompletionVisibility(
  completionId: string,
): Promise<ToggleVisibilityState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const { data: existing } = await supabase
    .from("route_completions")
    .select(
      "route_id, art, ist_oeffentlich, abdeckung_prozent, distanz_km, dauer_sekunden, bewegte_zeit_sekunden",
    )
    .eq("id", completionId)
    .eq("user_id", user.id)
    .maybeSingle<{
      route_id: string | null;
      art: "strecke" | "frei";
      ist_oeffentlich: boolean;
      abdeckung_prozent: number | null;
      distanz_km: number | null;
      dauer_sekunden: number | null;
      bewegte_zeit_sekunden: number | null;
    }>();

  if (!existing) return { error: "Fahrt nicht gefunden." };

  const nextOeffentlich = !existing.ist_oeffentlich;

  // Dieselben zwei Anker wie beim ersten Speichern, je nach Fahrtart: der
  // Deckungsgrad bei einer Streckenfahrt, die Mindestwerte bei einer freien
  // Fahrt. Ohne diese Prüfung liesse sich die Regel über den nachträglichen
  // Umschalter umgehen.
  if (nextOeffentlich) {
    if (existing.art === "frei") {
      const blocked = publicationBlockReason(
        existing.distanz_km ?? 0,
        existing.bewegte_zeit_sekunden ?? existing.dauer_sekunden ?? 0,
      );
      if (blocked) return { error: blocked };
    } else if ((existing.abdeckung_prozent ?? 0) < COVERAGE_THRESHOLD_PERCENT) {
      return {
        error: `Diese Fahrt deckt nur ${Math.round(existing.abdeckung_prozent ?? 0)}% der Strecke ab und kann daher nicht öffentlich gemacht werden.`,
      };
    }
  }

  // Die öffentliche Geometrie entsteht beim Veröffentlichen und verschwindet
  // beim Zurücknehmen — es soll kein gekappter Track einer Fahrt liegen
  // bleiben, die niemand mehr sehen darf.
  let trackOeffentlich: string | null = null;
  if (nextOeffentlich) {
    const { data: trackRow } = await supabase
      .from("fahrt_tracks")
      .select("track_geojson")
      .eq("completion_id", completionId)
      .maybeSingle<{ track_geojson: { coordinates: [number, number][] } }>();
    if (trackRow?.track_geojson?.coordinates) {
      trackOeffentlich = await publicTrackEwkt(
        supabase,
        user.id,
        trackRow.track_geojson.coordinates,
      );
    }
  }

  const { error } = await supabase
    .from("route_completions")
    .update({ ist_oeffentlich: nextOeffentlich, track_oeffentlich: trackOeffentlich })
    .eq("id", completionId)
    .eq("user_id", user.id);

  if (error) return { error: "Sichtbarkeit konnte nicht geändert werden." };

  revalidatePath("/profil");
  revalidatePath("/feed");
  revalidatePath(`/fahrten/${completionId}`);
  revalidatePath(`/fahrer/${user.id}`);
  if (existing.route_id) revalidatePath(`/strecken/${existing.route_id}`);
  revalidatePath("/leaderboards");
  return { error: null };
}

export interface UpdateNotizState {
  error: string | null;
}

// "Kommentar bearbeiten" im 3-Punkte-Menü der Fahrt-Detailseite
// (CompletionActionsMenu.tsx) — ändert die Notiz einer bereits gespeicherten
// Fahrt nachträglich (RLS erlaubt Update ohnehin nur der eigenen Zeile).
// Gleiche Kürzung wie beim ursprünglichen Eintrag in logTrackedCompletion.
export async function updateCompletionNotiz(
  completionId: string,
  notiz: string,
): Promise<UpdateNotizState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const trimmed = notiz.trim().slice(0, MAX_NOTIZ_LENGTH);

  const { data: existing } = await supabase
    .from("route_completions")
    .select("route_id")
    .eq("id", completionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) return { error: "Fahrt nicht gefunden." };

  const { error } = await supabase
    .from("route_completions")
    .update({ notiz: trimmed || null })
    .eq("id", completionId)
    .eq("user_id", user.id);

  if (error) return { error: "Kommentar konnte nicht gespeichert werden." };

  revalidatePath(`/fahrten/${completionId}`);
  revalidatePath("/profil");
  revalidatePath(`/fahrer/${user.id}`);
  return { error: null };
}

export interface RemovePhotoState {
  error: string | null;
}

// Entfernen-Button je Foto in der Fotos-Galerie der Fahrt-Detailseite
// (app/fahrten/[id]/page.tsx, nur für den Besitzer sichtbar) — löscht das
// Objekt aus dem Storage-Bucket (RLS auf storage.objects, siehe
// 0003_storage.sql, erlaubt das nur im eigenen {user_id}/-Ordner) und die
// zugehörige completion_photos-Zeile. Ab 0036_completion_photos.sql: pro
// Foto statt pro Fahrt, da eine Fahrt jetzt mehrere Fotos haben kann.
export async function removeCompletionPhoto(photoId: string): Promise<RemovePhotoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const { data: existing } = await supabase
    .from("completion_photos")
    .select("completion_id, foto_url, route_completions(route_id)")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .maybeSingle<{
      completion_id: string;
      foto_url: string;
      route_completions: { route_id: string } | null;
    }>();

  if (!existing) return { error: "Foto nicht gefunden." };

  const bucketMarker = `/${ROUTE_PHOTOS_BUCKET}/`;
  const markerIndex = existing.foto_url.indexOf(bucketMarker);
  if (markerIndex !== -1) {
    const path = existing.foto_url.slice(markerIndex + bucketMarker.length);
    await supabase.storage.from(ROUTE_PHOTOS_BUCKET).remove([path]);
  }

  const { error } = await supabase
    .from("completion_photos")
    .delete()
    .eq("id", photoId)
    .eq("user_id", user.id);

  if (error) return { error: "Foto konnte nicht entfernt werden." };

  revalidatePath(`/fahrten/${existing.completion_id}`);
  if (existing.route_completions) {
    revalidatePath(`/strecken/${existing.route_completions.route_id}`);
  }
  revalidatePath("/profil");
  revalidatePath("/feed");
  return { error: null };
}
