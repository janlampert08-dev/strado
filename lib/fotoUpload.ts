"use client";

import { createFotoUploadTickets } from "@/lib/actions/fotos";
import { createClient } from "@/lib/supabase/client";

// Lädt Fotos direkt in den privaten Bucket hoch, ohne sie durch die
// Server Action zu schicken (9 MB Body-Limit, Funktionslaufzeit pro Byte).
// Ablauf pro Datei: verkleinertes File -> Ticket (Pfad + Token) vom Server
// -> uploadToSignedUrl im Browser. Gibt die Storage-Pfade zurück, die das
// Formular danach als "foto_pfade" mitschickt; die Speicher-Action
// verifiziert sie (eigener Ordner, Endung, Existenz).
//
// Wirft bei jedem Fehlschlag — der Aufrufer fällt dann auf den klassischen
// Datei-Weg durchs Formular zurück, statt die Auswahl zu verlieren.
export async function ladeFotosDirektHoch(dateien: File[]): Promise<string[]> {
  if (dateien.length === 0) return [];
  const ergebnis = await createFotoUploadTickets(dateien.map((d) => d.type));
  if (!ergebnis.ok) throw new Error(ergebnis.error);
  const supabase = createClient();
  const pfade: string[] = [];
  for (let i = 0; i < dateien.length; i++) {
    const ticket = ergebnis.tickets[i];
    const { error } = await supabase.storage
      .from("route-photos")
      .uploadToSignedUrl(ticket.pfad, ticket.token, dateien[i], {
        contentType: dateien[i].type,
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
