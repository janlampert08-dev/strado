"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { bildEndungFuerMime } from "@/lib/validation";
import { istPremium, maxFotosProFahrt } from "@/lib/premium";

const FOTOS_BUCKET = "route-photos";

// Zehn Ticket-Sätze pro IP und Minute: ein Satz deckt eine ganze Fahrt ab
// (bis 12 Fotos mit Premium), mehr braucht niemand — ausser einem Skript.
const TICKET_SAETZE_PRO_MINUTE = 10;
const FENSTER_MS = 60_000;

export interface FotoUploadTicket {
  /** Storage-Pfad, unter dem der Client direkt hochlädt. */
  pfad: string;
  /** Einmal-Token für uploadToSignedUrl. */
  token: string;
}

// Mint signierte Direkt-Upload-Tickets für Fahrtfotos.
//
// Bisher lief jedes Foto als File durch die Server Action (9 MB
// Body-Limit, Funktionsspeicher und -laufzeit pro Byte). Jetzt lädt der
// Browser direkt in den privaten Bucket hoch; die Speicher-Action bekommt
// danach nur noch Pfade (siehe fotoPfadeAusFormData in
// lib/actions/completions.ts) und prüft sie gegen dieselben Regeln wie
// früher die Dateien: eigener Ordner, erlaubte Endung.
//
// Anmeldepflicht: Gäste zeichnen auf, aber speichern erst mit Konto —
// Tickets gibt es erst dann, wenn es auch etwas zu speichern gibt.
export async function createFotoUploadTickets(
  mimeTypen: string[],
): Promise<{ ok: true; tickets: FotoUploadTicket[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Anmeldung erforderlich." };

  if (!Array.isArray(mimeTypen) || mimeTypen.length === 0) {
    return { ok: false, error: "Keine Fotos angegeben." };
  }

  const premium = await istPremium();
  const max = maxFotosProFahrt(premium);
  if (mimeTypen.length > max) {
    return { ok: false, error: `Maximal ${max} Fotos pro Fahrt.` };
  }

  const endungen: string[] = [];
  for (const mime of mimeTypen) {
    if (typeof mime !== "string") return { ok: false, error: "Ungültiger Dateityp." };
    const ext = bildEndungFuerMime(mime);
    if (!ext) return { ok: false, error: "Nur JPG-, PNG-, WebP- oder GIF-Bilder sind erlaubt." };
    endungen.push(ext);
  }

  const ip = getClientIp(await headers());
  if (isRateLimitedByKey(`foto-tickets:${ip}`, TICKET_SAETZE_PRO_MINUTE, FENSTER_MS)) {
    return { ok: false, error: "Zu viele Anfragen." };
  }

  // Die Tickets hängen nicht aneinander — alle gleichzeitig angefordert,
  // in der Reihenfolge der Fotos. Scheitert eines, gibt es keines.
  const ergebnisse = await Promise.all(
    endungen.map(async (ext) => {
      const pfad = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await supabase.storage
        .from(FOTOS_BUCKET)
        .createSignedUploadUrl(pfad);
      if (error || !data?.signedUrl) return null;
      // uploadToSignedUrl braucht Pfad + Token getrennt; die signierte URL
      // selbst geht nie an den Client — sie läge sonst im DOM lesbar herum.
      return { pfad, token: data.token };
    }),
  );
  const tickets: FotoUploadTicket[] = [];
  for (const ticket of ergebnisse) {
    if (!ticket) return { ok: false, error: "Upload konnte nicht vorbereitet werden." };
    tickets.push(ticket);
  }

  return { ok: true, tickets };
}
