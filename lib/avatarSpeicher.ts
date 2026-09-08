// Aufräumen im avatars-Bucket: was dort für einen Nutzer liegt, entfernen —
// statt zu raten, wie es heissen könnte.
//
// WARUM NICHT ÜBER BILD_ENDUNGEN
//
// uploadAvatar() und deleteAccount() haben die zu löschenden Schlüssel
// bisher aus BILD_ENDUNGEN zusammengesetzt ("{uid}/avatar.{endung}" für
// jpg, png, webp, gif). Das trifft nur, was bildEndungFuerMime() HEUTE
// vergibt. Ältere Uploads leiteten die Endung noch aus foto.name ab und
// haben deshalb Objekte wie "avatar.jpeg" oder "avatar.JPG" hinterlassen —
// Endungen, die in BILD_ENDUNGEN nicht vorkommen und an denen beide
// Aufräumschritte vorbeigriffen.
//
// Die Folge war keine Kleinigkeit: der Bucket ist öffentlich (0015), der
// Schlüssel besteht aus der Nutzer-ID, und die steht in jeder
// /fahrer/[id]-URL. Ein Profilbild mit Altbestands-Endung überlebte damit
// sowohl das Ersetzen als auch die Kontolöschung und blieb für jeden
// abrufbar. In Produktion nachgewiesen: ein gelöschtes Konto, dessen
// avatar.jpeg weiterhin mit HTTP 200 antwortete.
//
// Auflisten statt Raten schliesst das unabhängig davon, welche Endungen es
// je gab oder geben wird. Die Liste ist zugleich die Wahrheit — BILD_ENDUNGEN
// bleibt, wofür es gedacht war: die erlaubten Formate beim Upload.

export const AVATAR_BUCKET = "avatars";

// Storage-list() liefert höchstens `limit` Einträge; ein Nutzerordner hält
// normalerweise genau eine Datei, die Seitenschleife ist die Absicherung
// gegen einen zugemüllten Ordner.
const SEITENGROESSE = 100;

// Bewusst eine schmale Schnittstelle statt SupabaseClient: die Funktionen
// hier brauchen genau diese zwei Aufrufe, und so sind sie ohne Netz und ohne
// Testdoppel des ganzen Clients prüfbar. supabase.storage.from(AVATAR_BUCKET)
// erfüllt sie strukturell.
export interface AvatarSpeicher {
  list(
    pfad: string,
    optionen: { limit: number; offset: number },
  ): Promise<{
    data: { name: string; id?: string | null }[] | null;
    error: { message: string } | null;
  }>;
  remove(pfade: string[]): Promise<{ error: { message: string } | null }>;
}

export interface AufraeumErgebnis {
  /** Die tatsächlich zum Löschen geschickten Schlüssel. */
  entfernt: string[];
  /** Meldung des ersten Fehlschlags, sonst null. Beide Aufrufer behandeln
   *  das Aufräumen als best effort und brechen daran nichts ab. */
  fehler: string | null;
}

/**
 * Alle Objektschlüssel im Ordner eines Nutzers, voll qualifiziert
 * ("{userId}/avatar.jpg"). Unterordner werden übersprungen: die Storage-API
 * gibt für sie kein id-Feld zurück, das ist der dokumentierte Weg, Ordner
 * und Dateien auseinanderzuhalten.
 */
export async function avatarObjekteAuflisten(
  speicher: AvatarSpeicher,
  userId: string,
): Promise<{ pfade: string[]; fehler: string | null }> {
  const pfade: string[] = [];

  for (let offset = 0; ; offset += SEITENGROESSE) {
    const { data, error } = await speicher.list(userId, { limit: SEITENGROESSE, offset });
    if (error) return { pfade, fehler: error.message };
    if (!data || data.length === 0) break;

    for (const eintrag of data) {
      if (eintrag.id === null || eintrag.id === undefined) continue;
      pfade.push(`${userId}/${eintrag.name}`);
    }

    if (data.length < SEITENGROESSE) break;
  }

  return { pfade, fehler: null };
}

/**
 * Entfernt die Avatar-Objekte eines Nutzers.
 *
 * `behalten` nimmt genau einen Schlüssel aus — den, der gerade
 * hochgeladen wurde. Ohne ihn löscht die Funktion den ganzen Ordner, was
 * bei der Kontolöschung genau das Gewünschte ist.
 *
 * Ein Lesefehler beim Auflisten führt NICHT zu einem Löschversuch auf einer
 * unvollständigen Liste: in dem Fall ist gar nicht bekannt, was dort liegt,
 * und ein Teil-Löschen würde nur den Eindruck erwecken, aufgeräumt zu haben.
 */
export async function avatareEntfernen(
  speicher: AvatarSpeicher,
  userId: string,
  behalten: string | null = null,
): Promise<AufraeumErgebnis> {
  const { pfade, fehler } = await avatarObjekteAuflisten(speicher, userId);
  if (fehler) return { entfernt: [], fehler };

  const zuEntfernen = pfade.filter((pfad) => pfad !== behalten);
  // remove([]) wäre ein Request ohne Wirkung — der Normalfall bei einem
  // Nutzer ohne Profilbild.
  if (zuEntfernen.length === 0) return { entfernt: [], fehler: null };

  const { error } = await speicher.remove(zuEntfernen);
  return { entfernt: zuEntfernen, fehler: error ? error.message : null };
}
