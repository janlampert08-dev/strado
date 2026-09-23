"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import {
  abdruckVon,
  erzeugeGeheimnis,
  istGeheimnis,
  istTicketId,
  type FahrtStartTicket,
} from "@/lib/fahrtstart";
import { isValidUuid } from "@/lib/validation";

// Meldet dem Server, dass eine Zeitmessung gerade begonnen hat, und gibt dem
// Client das Ticket dafür zurück (siehe lib/fahrtstart.ts und
// 0096_fahrtstart_serverseitig.sql).
//
// Aufgerufen aus useRideRecorder -> beginActualTracking, also im
// Streckenmodus beim Erreichen des Startpunkts und bei einer freien Fahrt mit
// dem ersten GPS-Fix — nicht beim Tippen auf "Strecke fahren". Der
// Unterschied ist der ganze Punkt: gemessen wird ab dem Moment, ab dem auch
// die Anzeige läuft.
//
// Bewusst ohne Anmeldepflicht. Aufzeichnen darf jeder (GefahrenSection nimmt
// userId: string | null), und ein Gast, der erst beim Speichern ein Konto
// anlegt, soll seine Zeit behalten. Die Datenbankfunktion hängt auth.uid()
// an, was bei einem Gast NULL ist; eingelöst wird später gegen das
// Geheimnis, nicht gegen die Sitzung.

/** Zwanzig Tickets pro IP und Minute: genug für ein Mobilfunk-NAT, zu wenig für ein Skript. */
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

// Meldet dem Server eine Position während der laufenden Aufzeichnung
// (0098_fahrtstart_puls.sql). Die gewertete Dauer ist danach die Spanne
// zwischen Start und letztem Puls, nicht die zwischen Start und Einlösen —
// deshalb bringt es nichts mehr, das Ticket mitten in der Fahrt einzulösen.
//
// Wie fahrtStartAnlegen bewusst ohne Anmeldepflicht: Gäste zeichnen auf, also
// pulsen sie auch. Und wie dort ist ein Fehlschlag kein Abbruch — ein
// verlorener Puls verkürzt nur das Fenster, in dem die Fahrt wertbar bleibt.
//
// Die Bremse hier ist grober als die in der Datenbank (dort: nichts unter
// 5 Sekunden je Ticket) und fängt den Fall ab, dass viele Tickets von
// derselben Stelle aus bepulst werden. Bei 20 Sekunden Intervall braucht eine
// echte Fahrt drei Pulse pro Minute; 90 lassen also 30 gleichzeitige
// Aufzeichnungen hinter einer gemeinsamen Adresse zu (Mobilfunk-NAT), bevor
// etwas verloren geht.
const PULSE_PRO_MINUTE = 90;

export async function fahrtStartPuls(
  ticket: FahrtStartTicket,
  lat: number,
  lng: number,
): Promise<boolean> {
  if (!istTicketId(ticket?.id) || !istGeheimnis(ticket?.geheimnis)) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;

  const ip = getClientIp(await headers());
  if (isRateLimitedByKey(`fahrtpuls:${ip}`, PULSE_PRO_MINUTE, FENSTER_MS)) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fahrt_start_puls", {
    p_id: ticket.id,
    p_abdruck: await abdruckVon(ticket.geheimnis),
    p_lat: lat,
    p_lng: lng,
  });

  return !error && data === true;
}
