"use server";

import { createClient } from "@/lib/supabase/server";
import { EINRICHTUNG_META_SCHLUESSEL } from "@/lib/einrichtung";

/**
 * Hält fest, dass die Einrichtung durch ist — abgeschlossen oder mit
 * "Später" übersprungen, beides zählt gleich: niemand soll sie zweimal
 * sehen.
 *
 * Über auth.updateUser als der angemeldete Nutzer selbst, nicht über den
 * Admin-Client: es geht um den eigenen Eintrag, und GoTrue führt die
 * Metadaten zusammen statt sie zu ersetzen (display_name, herkunft_code und
 * promo_code aus signUp() bleiben stehen). Keine Tabelle, keine Migration.
 */
export async function einrichtungAbschliessen(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.auth.updateUser({
    data: { [EINRICHTUNG_META_SCHLUESSEL]: new Date().toISOString() },
  });
  return { ok: !error };
}
