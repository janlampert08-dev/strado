"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import {
  abdruckVon,
  erzeugeGeheimnis,
  istGastSperre,
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

// Ruft eine der beiden Fahrtstart-Funktionen auf — zuerst mit der Sitzung
// des Aufrufers, für einen Gast notfalls über den Service-Role-Client.
//
// Warum der Umweg: seit 0133_gastticket_bremse.sql haben anon-Aufrufe kein
// EXECUTE mehr auf fahrt_start_anlegen/fahrt_start_puls. Vorher waren beide
// per PostgREST direkt mit dem öffentlichen Schlüssel erreichbar, an der
// IP-Bremse hier vorbei — und fahrt_start_anlegen liess sich so ohne jede
// wirksame Grenze mit Gasttickets füllen. Jetzt kommt ein Gast nur noch
// durch diese Server Action an die Funktionen, also hinter
// isRateLimitedByKey.
//
// Das ist eine dritte Aufrufstelle des Service-Role-Clients (siehe
// lib/supabase/admin.ts und AGENTS.md → Supabase Rules). Sie ist bewusst
// schmal: kein Tabellenzugriff, nur diese zwei SECURITY-DEFINER-Funktionen,
// die ohnehin für jeden Gast gedacht sind. Der Service-Role-Aufruf trägt
// keine Sitzung, auth.uid() ist dort NULL — die Funktion nimmt also genau den
// Gastzweig, den ein anon-Aufruf auch genommen hätte, mit denselben Grenzen.
// Angemeldete Fahrer laufen nie hier hindurch: authenticated behält EXECUTE,
// der erste Aufruf gelingt, und ihr Ticket hängt an ihrem Konto.
//
// Warum "erst versuchen, dann ausweichen" statt vorher getUser() zu fragen:
// getUser() ist ein Netzwerkaufruf gegen GoTrue (lib/supabase/server.ts), und
// gepulst wird alle 10–20 Sekunden. So zahlt nur der Gast einen zweiten
// Aufruf, und der Code funktioniert vor wie nach der Migration: solange anon
// noch EXECUTE hat, gelingt schon der erste Aufruf.
async function fahrtstartRpc(
  funktion: "fahrt_start_anlegen" | "fahrt_start_puls",
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { code?: string } | null }> {
  const supabase = await createClient();
  const erster = await supabase.rpc(funktion, args);
  if (!erster.error || !istGastSperre(erster.error)) {
    return { data: erster.data, error: erster.error };
  }
  const zweiter = await createAdminClient().rpc(funktion, args);
  return { data: zweiter.data, error: zweiter.error };
}

export type FahrtStartErgebnis =
  | { ok: true; ticket: FahrtStartTicket }
  | { ok: false };

export async function fahrtStartAnlegen(
  art: "strecke" | "frei",
  streckeId?: string | null,
): Promise<FahrtStartErgebnis> {
  if (art !== "strecke" && art !== "frei") return { ok: false };
  if (streckeId != null && !isValidUuid(streckeId)) return { ok: false };

  // Gäste erreichen die Funktion seit 0133 nur noch über diesen Weg — ohne
  // Bremse könnte ein Skript beliebig viele Tickets anlegen. Es ist
  // Schreibzugriff ohne Sitzung, und der gehört begrenzt. Die Datenbank
  // deckelt Gasttickets zusätzlich global (10 pro Minute, 120 pro Stunde),
  // weil dieser Zähler je Serverinstanz im Speicher lebt.
  const ip = getClientIp(await headers());
  if (isRateLimitedByKey(`fahrtstart:${ip}`, TICKETS_PRO_MINUTE, FENSTER_MS)) {
    return { ok: false };
  }

  const geheimnis = erzeugeGeheimnis();
  const abdruck = await abdruckVon(geheimnis);

  const { data, error } = await fahrtstartRpc("fahrt_start_anlegen", {
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

  const { data, error } = await fahrtstartRpc("fahrt_start_puls", {
    p_id: ticket.id,
    p_abdruck: await abdruckVon(ticket.geheimnis),
    p_lat: lat,
    p_lng: lng,
  });

  return !error && data === true;
}
