"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { istPremium } from "@/lib/premium";
import { isRateLimited } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";

// Pass-Alarm setzen oder entfernen (0112_pass_status_und_alarm.sql).
//
// Ein Zielzustand statt eines Umschalters wie toggleFavorite: ein doppelt
// abgeschickter Klick (langsames Netz, zweiter Tipp) soll den Alarm nicht
// wieder ausschalten. "aktiv: true" zweimal ist dasselbe wie einmal.
//
// Premium wird zweimal geprüft — hier über istPremium() für eine lesbare
// Antwort, und in der Insert-Policy aus 0112 als eigentliche Schranke, die
// auch ein direkter PostgREST-Aufruf nicht umgeht. Entfernen verlangt kein
// Premium: wer sein Abo beendet, darf seine Alarme trotzdem loswerden.

export interface PassAlarmResult {
  error: string | null;
}

// Wie FAVORITE_COOLDOWN_MS: bremst Dauerklicks, nicht Menschen.
const PASS_ALARM_COOLDOWN_MS = 500;

export async function passAlarmSetzen(routeId: string, aktiv: boolean): Promise<PassAlarmResult> {
  if (!isValidUuid(routeId) || typeof aktiv !== "boolean") {
    return { error: "Unbekannte Strecke. Bitte lade die Seite neu." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Melde dich an, um einen Alarm zu setzen." };

  if (!aktiv) {
    // Nach user_id UND route_id gefiltert — die Policy liesse ohnehin nur
    // eigene Zeilen zu, aber das Filtern auf die Session-ID macht die
    // Absicht hier sichtbar. Null getroffene Zeilen sind kein Fehler: der
    // Alarm ist weg, und genau das war das Ziel.
    const { error } = await supabase
      .from("pass_alarme")
      .delete()
      .eq("user_id", user.id)
      .eq("route_id", routeId);
    if (error) return { error: "Der Alarm liess sich nicht entfernen. Bitte versuche es noch einmal." };
    revalidatePath(`/strecken/${routeId}`);
    return { error: null };
  }

  if (!(await istPremium())) {
    return { error: "Der Pass-Alarm gehört zu Premium." };
  }

  if (
    await isRateLimited(supabase, "pass_alarme", "erstellt_am", "user_id", user.id, PASS_ALARM_COOLDOWN_MS)
  ) {
    return { error: "Einen Moment — bitte gleich noch einmal." };
  }

  const { error } = await supabase.from("pass_alarme").insert({ user_id: user.id, route_id: routeId });

  // 23505: der Alarm steht schon (zweiter Tab, doppelter Klick). Zielzustand
  // erreicht.
  if (error && error.code !== "23505") {
    // 42501: die Policy hat abgelehnt — kein Premium mehr laut Datenbank,
    // oder die Strecke ist keine freigegebene Passstrecke.
    if (error.code === "42501") {
      return { error: "Für diese Strecke lässt sich kein Alarm setzen." };
    }
    return { error: "Der Alarm liess sich nicht setzen. Bitte versuche es noch einmal." };
  }

  revalidatePath(`/strecken/${routeId}`);
  return { error: null };
}
