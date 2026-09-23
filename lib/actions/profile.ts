"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { metadatenEntfernen } from "@/lib/imageMetadata";
import { recomputePublicTracks } from "@/lib/publicTrack";
import { PRIVACY_RADIUS_OPTIONS } from "@/lib/track";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { bildEndungFuerMime } from "@/lib/validation";
import { AVATAR_BUCKET, avatareEntfernen } from "@/lib/avatarSpeicher";

export interface ProfileActionState {
  error: string | null;
  success?: boolean;
}

export interface ProfileSearchResult {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Region der jüngsten öffentlichen Fahrt, null ohne öffentliche Fahrt. */
  region: string | null;
  /** Anzahl öffentlicher Fahrten. */
  fahrten: number;
  follower: number;
}

// Namenssuche für die Profilsuche im Feed (components/ProfileSearch.tsx).
// display_name/avatar_url sind bereits öffentlich lesbar (RLS "Profile sind
// öffentlich lesbar" seit 0001_init.sql, Spalten-Grants in
// 0034_profiles_column_grant_hardening.sql) — dieselben Daten, die z. B. in
// Follower-Listen und Bestenlisten ohnehin für jeden sichtbar sind, hier nur
// zusätzlich per Namenssuche auffindbar statt nur beim Durchblättern.
//
// Ohne Session aufrufbar: die Funktion ist aus einer "use server"-Datei
// exportiert und damit von aussen erreichbar, auch ohne die UI. Deshalb ein
// IP-Limit wie bei den öffentlichen Endpunkten unter app/api/strecken —
// sonst liesse sich der gesamte display_name-Bestand per Präfix-Sweep
// abziehen, und jeder Aufruf erzeugt einen ilike-'%…%'-Scan ohne nutzbaren
// Index. Grosszügig bemessen, weil die Suche bei jedem Tastendruck feuert.
export async function searchProfiles(query: string): Promise<ProfileSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const ip = getClientIp(await headers());
  if (isRateLimitedByKey(`profilsuche:${ip}`, 120, 60_000)) return [];

  const supabase = await createClient();
  // ilike-Sonderzeichen im Nutzer-Input escapen, sonst könnten "%"/"_" selbst
  // als Wildcard statt als gesuchtes Literalzeichen wirken.
  const escaped = trimmed.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, zeigt_avatar")
    .not("display_name", "is", null)
    .ilike("display_name", `%${escaped}%`)
    .order("display_name")
    .limit(8);

  const profile = data ?? [];
  if (profile.length === 0) return [];

  // UNTERSCHEIDBARKEIT. Bis hierher kam nur Name und Bild zurück — zwei
  // "Jan" in der Liste waren nicht auseinanderzuhalten, und wer sein Bild
  // nicht zeigt, stand als leerer Kreis mit Vornamen da. Dazu kommen jetzt
  // Region, Anzahl Fahrten und Follower, und zwar ausschliesslich aus
  // Quellen, die für jeden ohnehin lesbar sind:
  //
  // - Region und Fahrtenzahl aus public_fahrten — dieselbe Sicht, die den
  //   öffentlichen Feed und das öffentliche Profil speist. Sie enthält nur
  //   Fahrten mit ist_oeffentlich = true; eine private Fahrt verrät hier
  //   also weder ihre Region noch ihre Existenz.
  // - Follower über get_follow_counts, die SECURITY-DEFINER-Funktion, die
  //   auch das Profil nutzt (0040). Die Zahl ist laut Einstellungen "für
  //   andere immer sichtbar", unabhängig von zeigt_follower_liste — die
  //   Liste bleibt geschützt, die Zahl war nie geschützt.
  //
  // Beides läuft mit der Sitzung des Aufrufers (createClient), nicht mit dem
  // Admin-Client: keine RLS-Umgehung, nichts, was nicht schon per PostgREST
  // abrufbar wäre. Die Last bleibt durch das IP-Limit oben und limit(8)
  // begrenzt — höchstens neun zusätzliche Abfragen je Suche.
  const ids = profile.map((p) => p.id);
  const [{ data: fahrtenDaten }, followerZahlen] = await Promise.all([
    supabase
      .from("public_fahrten")
      .select("user_id, region")
      .in("user_id", ids)
      .order("datum", { ascending: false })
      .limit(500),
    Promise.all(
      ids.map(async (id) => {
        const { data: zeile } = await supabase
          .rpc("get_follow_counts", { p_user_id: id })
          .single();
        return [id, (zeile as { followers?: number } | null)?.followers ?? 0] as const;
      }),
    ),
  ]);

  const fahrtenJeNutzer = new Map<string, { region: string | null; anzahl: number }>();
  for (const f of (fahrtenDaten ?? []) as { user_id: string; region: string | null }[]) {
    const bisher = fahrtenJeNutzer.get(f.user_id);
    // Sortiert nach Datum absteigend: der erste Treffer ist die jüngste Fahrt.
    if (bisher) bisher.anzahl += 1;
    else fahrtenJeNutzer.set(f.user_id, { region: f.region, anzahl: 1 });
  }
  const followerJeNutzer = new Map(followerZahlen);

  return profile.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    avatarUrl: p.zeigt_avatar ? p.avatar_url : null,
    region: fahrtenJeNutzer.get(p.id)?.region ?? null,
    fahrten: fahrtenJeNutzer.get(p.id)?.anzahl ?? 0,
    follower: followerJeNutzer.get(p.id) ?? 0,
  }));
}

export async function updateVisibilitySettings(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  // Der Privatzonen-Radius kommt aus derselben Maske wie die übrigen
  // Sichtbarkeits-Schalter. Zulässig sind ausschliesslich die angebotenen
  // Werte.
  //
  // Der Feldwert wird bewusst erst als Text geprüft: Number(null) und
  // Number("") ergeben 0, und 0 ist ein gültiger Radius ("Privatzone aus").
  // Ein Formular ohne dieses Feld würde die Privatzone also stillschweigend
  // abschalten — bei einer Datenschutz-Einstellung genau die falsche
  // Richtung.
  //
  // Ein unzulässiger Wert bricht ab, statt auf DEFAULT_PRIVACY_RADIUS_M
  // zurückzufallen. Der Rückfall war für ein Konto mit 500 m eine
  // Verengung des Schutzes auf 200 m — und weil recomputePublicTracks()
  // direkt darunter alle bereits geteilten Fahrten mit dem neuen Radius neu
  // zuschneidet, hätte er rückwirkend mehr Geometrie freigegeben, quittiert
  // mit "Gespeichert.". Das <select> schickt immer einen der vier Werte;
  // etwas anderes ist entweder ein Fehler oder ein manipulierter Request,
  // und in beiden Fällen ist Nichtstun die richtige Antwort.
  const radiusRaw = formData.get("privatzone_radius_m");
  const radius = typeof radiusRaw === "string" && radiusRaw.trim() !== "" ? Number(radiusRaw) : NaN;
  if (!(PRIVACY_RADIUS_OPTIONS as readonly number[]).includes(radius)) {
    return { error: "Ungültiger Wert für die Privatzone. Bitte lade die Seite neu." };
  }
  const privatzoneRadiusM = radius;

  // profiles.zeigt_premium_badge wird hier bewusst NICHT geschrieben. Das
  // Abzeichen hinter dem Namen ist aus der App entfernt; die Spalte bleibt
  // im Schema (Kernregel 9 — 0021 und 0087 sind angewandt und werden nicht
  // angefasst), erreicht aber keine Oberfläche mehr. Sie hier
  // unerwähnt zu lassen heisst zugleich, dass ein gespeicherter Wert
  // unangetastet bleibt, statt beim nächsten Speichern still auf false zu
  // fallen — dasselbe Verhalten wie bei der Entfernung vom 2026-09-07.
  const { error } = await supabase
    .from("profiles")
    .update({
      privatzone_radius_m: privatzoneRadiusM,
      zeigt_fahrzeuge: formData.get("zeigt_fahrzeuge") === "true",
      zeigt_avatar: formData.get("zeigt_avatar") === "true",
      zeigt_paesse: formData.get("zeigt_paesse") === "true",
      zeigt_hoehenmeter: formData.get("zeigt_hoehenmeter") === "true",
      zeigt_distanz: formData.get("zeigt_distanz") === "true",
      zeigt_follower_liste: formData.get("zeigt_follower_liste") === "true",
      // 0125: Durchschnittstempo auf geteilten Fahrten. Der Besitzer sieht
      // es immer; das Flag entscheidet nur, ob Strado es anderen ausweist.
      zeigt_tempo: formData.get("zeigt_tempo") === "true",
    })
    .eq("id", user.id);

  if (error) return { error: "Einstellungen konnten nicht gespeichert werden." };

  // Ein geänderter Radius muss auch für bereits geteilte Fahrten gelten —
  // sonst wirkte die strengere Einstellung nur in die Zukunft, und genau
  // die alten Fahrten wären das Problem. Schlägt das für eine Fahrt fehl,
  // bleibt dort der bisherige, weitere Track öffentlich: das darf nicht als
  // "Gespeichert." durchgehen.
  const recomputed = await recomputePublicTracks(supabase, user.id, privatzoneRadiusM);
  if (!recomputed) {
    return {
      error:
        "Die Einstellungen wurden gespeichert, aber nicht alle bereits geteilten Fahrten konnten neu zugeschnitten werden. Bitte versuche es noch einmal.",
    };
  }

  revalidatePath("/profil");
  revalidatePath("/profil/einstellungen");
  revalidatePath(`/fahrer/${user.id}`);
  revalidatePath("/feed");
  revalidatePath("/ranglisten");
  return { error: null, success: true };
}

const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export async function uploadAvatar(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  // Mengenbremse. Die Prüfungen weiter unten stimmen alle — 4-MB-Grenze,
  // MIME-Allowlist, EXIF-Entfernung —, aber sie gelten je Aufruf und keine
  // von ihnen begrenzt, wie viele Aufrufe es sein dürfen. Jeder davon lädt
  // bis zu 4 MB hoch, liest sie in den Speicher (arrayBuffer), schreibt sie
  // durch metadatenEntfernen() und legt sie in Supabase Storage ab.
  //
  // Der Speicherplatz wächst dabei nicht unbegrenzt, denn der Schlüssel ist
  // fest ({user_id}/avatar.{ext}, vier mögliche Endungen) und upsert
  // überschreibt. Was unbegrenzt wächst, sind Bandbreite, Speicherbedarf und
  // Storage-Schreibvorgänge.
  //
  // Zehn Wechsel in zehn Minuten sind weit jenseits dessen, was jemand beim
  // Aussuchen eines Profilbilds braucht, und die Meldung sagt, was zu tun
  // ist — anders als beim Abo weiter unten ist hier nichts verloren, wenn
  // ein Versuch wartet.
  if (isRateLimitedByKey(`avatar:${user.id}`, 10, 10 * 60_000)) {
    return { error: "Zu viele Uploads. Bitte warte ein paar Minuten." };
  }

  // instanceof statt eines Casts: formData.get() liefert bei einem
  // gleichnamigen Textfeld einen String, und der hat weder .size noch .type.
  // Der Cast hätte das durchgereicht, foto.type wäre undefined und
  // bildEndungFuerMime() unten mit einem TypeError abgebrochen — also ein
  // 500er statt der Fehlermeldung, die hier schon steht. Dieselbe Prüfung
  // macht lib/actions/completions.ts beim Fahrt-Foto bereits.
  const foto = formData.get("avatar");
  if (!(foto instanceof File) || foto.size === 0) return { error: "Bitte ein Foto auswählen." };
  if (foto.size > MAX_AVATAR_BYTES) return { error: "Foto ist zu gross (max. 4 MB)." };

  // Endung aus dem Content-Type statt aus foto.name — Begründung in
  // lib/validation.ts. Ersetzt zugleich die alte
  // type.startsWith("image/")-Prüfung: die liess image/svg+xml durch, das
  // die Bucket-Allowlist aus 0033 zwar abweist, aber erst eine Ebene
  // tiefer und mit einer rohen Storage-Fehlermeldung.
  const ext = bildEndungFuerMime(foto.type);
  if (!ext) {
    return { error: "Nur JPG-, PNG-, WebP- oder GIF-Bilder sind erlaubt." };
  }
  const path = `${user.id}/avatar.${ext}`;

  // Wie beim Fahrt-Foto: EXIF-Metadaten raus, bevor die Datei gespeichert
  // wird. Ein Profilbild ist zwar zum Zeigen gedacht, sein Aufnahmeort ist es
  // nicht — und der avatars-Bucket ist öffentlich lesbar.
  const bereinigt = metadatenEntfernen(new Uint8Array(await foto.arrayBuffer()), foto.type);

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    // contentType explizit, weil ein Uint8Array den Typ nicht mitbringt.
    .upload(path, bereinigt, { upsert: true, contentType: foto.type });
  if (uploadError) return { error: "Foto konnte nicht hochgeladen werden." };

  // Fassungen mit ANDERER Endung entfernen. upsert:true ersetzt nur die
  // Datei unter genau diesem Schlüssel — wer sein avatar.jpg durch ein PNG
  // ersetzt, legt avatar.png daneben und lässt avatar.jpg liegen. Der
  // avatars-Bucket ist öffentlich (0015), der Schlüssel besteht aus der
  // Nutzer-ID, und die steht in jeder /fahrer/[id]-URL: das alte Bild bliebe
  // also für jeden abrufbar — auch dann, wenn es genau deshalb ersetzt wurde.
  //
  // Der Ordner wird dafür aufgelistet statt aus BILD_ENDUNGEN zusammengesetzt.
  // Die Endungsliste trifft nur, was bildEndungFuerMime() heute vergibt;
  // ältere Uploads leiteten sie aus foto.name ab und haben avatar.jpeg und
  // avatar.JPG hinterlassen, an denen das Aufräumen vorbeigriff. Begründung
  // in lib/avatarSpeicher.ts.
  //
  // Best effort: die Storage-Policy aus 0015 erlaubt dem Nutzer das Löschen
  // im eigenen Ordner, ein Fehlschlag darf den Upload aber nicht rückgängig
  // machen (das neue Bild steht bereits).
  const { fehler: aufraeumFehler } = await avatareEntfernen(
    supabase.storage.from(AVATAR_BUCKET),
    user.id,
    path,
  );
  if (aufraeumFehler) {
    console.error("Alte Avatar-Fassungen nicht entfernt", { userId: user.id }, aufraeumFehler);
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-Buster, damit ein ersetztes Avatar sofort neu geladen wird (die
  // öffentliche URL bliebe sonst dieselbe und der Browser zeigt die alte
  // Cache-Version).
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (error) return { error: "Profil konnte nicht aktualisiert werden." };

  revalidatePath("/profil");
  revalidatePath(`/fahrer/${user.id}`);
  return { error: null };
}

/**
 * Den eigenen Anzeigenamen ändern (Einstellungen → Konto).
 *
 * Die Regeln stehen in der Datenbank (0109_profilname_aendern.sql), nicht
 * hier: die Funktion arbeitet ausschliesslich auf auth.uid(), prüft Länge
 * und Eindeutigkeit wie signUp() und ist der einzige Schreibweg für
 * display_name — die Spalte hat keinen UPDATE-Grant. Diese Action setzt
 * davor nur eine Mengenbremse und übersetzt die Rückgabecodes in Sätze.
 *
 * Solange 0109 nicht eingespielt ist, scheitert der RPC-Aufruf; dann steht
 * eine allgemeine Meldung da statt eines Absturzes.
 */
export async function aendereProfilnamen(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bitte melde dich zuerst an." };

  // Fünf Änderungen in zehn Minuten: genug für Tippfehler, zu wenig, um den
  // Namensbestand per Ausprobieren nach vergebenen Namen abzusuchen.
  if (isRateLimitedByKey(`profilname:${user.id}`, 5, 10 * 60_000)) {
    return { error: "Zu viele Änderungen. Bitte warte ein paar Minuten." };
  }

  const name = String(formData.get("display_name") ?? "").slice(0, 200);
  const { data, error } = await supabase.rpc("profilname_aendern", { p_name: name });
  if (error) {
    console.error("Profilname konnte nicht geändert werden:", error.message);
    return { error: "Der Name konnte gerade nicht gespeichert werden. Bitte versuche es später erneut." };
  }

  switch (data as string) {
    case "ok":
      revalidatePath("/profil");
      revalidatePath("/profil/einstellungen");
      revalidatePath(`/fahrer/${user.id}`);
      revalidatePath("/feed");
      revalidatePath("/ranglisten");
      return { error: null, success: true };
    case "unveraendert":
      return { error: null, success: true };
    case "zu_kurz":
      return { error: "Der Name braucht mindestens 2 Zeichen." };
    case "zu_lang":
      return { error: "Der Name darf höchstens 50 Zeichen lang sein." };
    case "vergeben":
      return { error: "Dieser Name ist bereits vergeben." };
    case "ungueltig":
      return { error: "Der Name enthält unsichtbare oder Steuerzeichen." };
    default:
      return { error: "Der Name konnte gerade nicht gespeichert werden." };
  }
}
