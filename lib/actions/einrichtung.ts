"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EINRICHTUNG_META_SCHLUESSEL, zielNachEinrichtung } from "@/lib/einrichtung";

/**
 * Hält fest, dass die Einrichtung durch ist — abgeschlossen oder mit
 * "Später" übersprungen, beides zählt gleich: niemand soll sie zweimal
 * sehen. Danach geht es an das gewählte Ziel.
 *
 * Über auth.updateUser als der angemeldete Nutzer selbst, nicht über den
 * Admin-Client: es geht um den eigenen Eintrag, und GoTrue führt die
 * Metadaten zusammen statt sie zu ersetzen (display_name, herkunft_code und
 * promo_code aus signUp() bleiben stehen). Keine Tabelle, keine Migration.
 *
 * WARUM DAS REDIRECT HIER STEHT UND NICHT IM CLIENT: updateUser schreibt das
 * Session-Cookie neu, und ein Cookie-Schreiben in einer Server Action lässt
 * Next die aktuelle Seite neu rendern. /einrichten sähe dann "erledigt" und
 * schickte selbst weiter — auf ihr eigenes Ziel, nicht auf das, das der
 * Nutzer gerade angetippt hat. Ein redirect() aus der Action gewinnt über
 * dieses Neu-Rendern. Deshalb wird auch erst beim Verlassen gespeichert,
 * nicht schon beim Erreichen von "Alles bereit.".
 */
export async function einrichtungAbschliessen(formData: FormData): Promise<void> {
  const ziel = zielNachEinrichtung(String(formData.get("ziel") ?? ""));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Schlägt das Speichern fehl, geht es trotzdem weiter: schlimmstenfalls
    // sieht jemand die Einrichtung noch einmal — besser als ein Knopf, der
    // nichts tut.
    await supabase.auth.updateUser({
      data: { [EINRICHTUNG_META_SCHLUESSEL]: new Date().toISOString() },
    });
  }

  redirect(ziel);
}
