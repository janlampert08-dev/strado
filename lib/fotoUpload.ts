"use client";

import { createFotoUploadTickets } from "@/lib/actions/fotos";
import { createClient } from "@/lib/supabase/client";
import { metadatenEntfernen } from "@/lib/imageMetadata";

// Lädt Fotos direkt in den privaten Bucket hoch, ohne sie durch die
// Server Action zu schicken (9 MB Body-Limit, Funktionslaufzeit pro Byte).
// Ablauf pro Datei: EXIF-Strip im Browser -> Ticket (Pfad + Token) vom
// Server -> uploadToSignedUrl im Browser. Gibt die Storage-Pfade zurück,
// die das Formular danach als "foto_pfade" mitschickt; die Speicher-Action
// verifiziert sie (eigener Ordner, Endung, Existenz).
//
// Der Strip läuft bewusst VOR dem Upload: der klassische Datei-Weg durchs
// Formular bereinigt server-seitig (lib/actions/completions.ts), der
// Direkt-Weg käme sonst mit GPS-EXIF im privaten Bucket an.
//
// Wirft bei jedem Fehlschlag — der Aufrufer fällt dann auf den klassischen
// Datei-Weg durchs Formular zurück, statt die Auswahl zu verlieren.
async function bereinigeDatei(datei: File): Promise<File> {
  try {
    const puffer = new Uint8Array(await datei.arrayBuffer());
    const bereinigt = metadatenEntfernen(puffer, datei.type);
    if (bereinigt === puffer) return datei;
    return new File([bereinigt as BlobPart], datei.name, { type: datei.type });
  } catch {
    return datei;
  }
}

export async function ladeFotosDirektHoch(dateien: File[]): Promise<string[]> {
  if (dateien.length === 0) return [];
  const bereinigt = await Promise.all(dateien.map(bereinigeDatei));
  const ergebnis = await createFotoUploadTickets(bereinigt.map((d) => d.type));
  if (!ergebnis.ok) throw new Error(ergebnis.error);
  const supabase = createClient();
  const pfade: string[] = [];
  for (let i = 0; i < bereinigt.length; i++) {
    const ticket = ergebnis.tickets[i];
    const { error } = await supabase.storage
      .from("route-photos")
      .uploadToSignedUrl(ticket.pfad, ticket.token, bereinigt[i], {
        contentType: bereinigt[i].type,
      });
    if (error) throw new Error("Direkt-Upload fehlgeschlagen.");
    pfade.push(ticket.pfad);
  }
  return pfade;
}

// Best effort: direkt hochgeladene, dann doch entfernte Fotos wieder aus dem
// Bucket löschen, damit sie nicht verwaist liegen bleiben. Fehler sind egal
// — die Speicher-Action räumt beim Fehlschlag ebenfalls auf, und ein
// verwaistes Objekt im privaten Bucket sieht niemand.
export async function loescheDirektUpload(pfad: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.storage.from("route-photos").remove([pfad]);
  } catch {
    // Absichtlich still.
  }
}
