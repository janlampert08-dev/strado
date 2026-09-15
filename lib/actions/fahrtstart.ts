"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { abdruckVon, erzeugeGeheimnis, type FahrtStartTicket } from "@/lib/fahrtstart";
import { isValidUuid } from "@/lib/validation";

// Meldet dem Server, dass eine Zeitmessung gerade begonnen hat, und gibt dem
// Client das Ticket dafür zurück (siehe lib/fahrtstart.ts und
// 0096_fahrtstart_serverseitig.sql).
//
// Aufgerufen aus useRideRecorder -> beginActualTracking, also im
// Streckenmodus beim Erreichen des Startpunkts und bei einer freien Fahrt mit
// dem ersten GPS-Fix — nicht beim Tippen auf "Strecke starten". Der
// Unterschied ist der ganze Punkt: gemessen wird ab dem Moment, ab dem auch
// die Anzeige läuft.
//
// Bewusst ohne Anmeldepflicht. Aufzeichnen darf jeder (GefahrenSection nimmt
// userId: string | null), und ein Gast, der erst beim Speichern ein Konto
// anlegt, soll seine Zeit behalten. Die Datenbankfunktion hängt auth.uid()
// an, was bei einem Gast NULL ist; eingelöst wird später gegen das
// Geheimnis, nicht gegen die Sitzung.

/** Ein Ticket pro IP und Minute reicht für jede echte Fahrt — mehr wäre ein Skript. */
const TICKETS_PRO_MINUTE = 20;
const FENSTER_MS = 60_000;

export type FahrtStartErgebnis =
  | { ok: true; ticket: FahrtStartTicket }
  | { ok: false };

export async function fahrtStartAnlegen(
  art: "strecke" | "frei",
  streckeId?: string | null,
): Promise<FahrtStartErgebnis> {
  if (art !== "strecke" && art !== "frei") return { ok: false };
  if (streckeId != null && !isValidUuid(streckeId)) return { ok: false };

  // Die Funktion ist auch für anon freigegeben — ohne Bremse könnte ein
  // Skript beliebig viele Tickets anlegen. Teuer wird das nicht, aber es ist
  // Schreibzugriff ohne Sitzung, und der gehört begrenzt.
  const ip = getClientIp(await headers());
  if (isRateLimitedByKey(`fahrtstart:${ip}`, TICKETS_PRO_MINUTE, FENSTER_MS)) {
    return { ok: false };
  }

  const geheimnis = erzeugeGeheimnis();
  const abdruck = await abdruckVon(geheimnis);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fahrt_start_anlegen", {
    p_abdruck: abdruck,
    p_art: art,
    p_strecke_id: streckeId ?? null,
  });

  // Fehlschlag ist kein Abbruch der Fahrt: ohne Ticket wird die Fahrt später
  // mit dauer_quelle = "trail" gespeichert und erscheint nur nicht in der
  // Bestenliste. Eine Aufzeichnung an einem Netzloch scheitern zu lassen wäre
  // die schlechtere Wahl — genau darum geht es beim Fahren im Funkloch.
  if (error || typeof data !== "string") return { ok: false };

  return { ok: true, ticket: { id: data, geheimnis } };
}
