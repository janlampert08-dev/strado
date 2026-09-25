// Das Geheimnis eines Fahrtstart-Tickets (siehe 0096_fahrtstart_serverseitig.sql).
//
// Der Ablauf in einem Satz: beim tatsächlichen Beginn der Zeitmessung legt der
// Server eine Zeile in fahrt_starts an und gibt dem Client ein Geheimnis
// mit; beim Speichern löst der Client damit ein, und die Dauer ist die
// Differenz zweier Serverzeiten statt eine Summe von Browser-Zeitstempeln.
// Das schliesst Bein 2 des Audit-Befunds A1 (docs/audit/README.md).
//
// Warum ein Geheimnis und nicht die blosse Ticket-ID: eine ID reicht als
// Nachweis nicht — Ticket-IDs tauchen in Snapshots, Logs und im Netzwerk auf,
// und wer eine fremde kennt, dürfte sonst ihre Zeit einlösen. In der Tabelle
// liegt nur der SHA-256-Abdruck; das Geheimnis selbst kennt ausschliesslich
// der Browser, der die Fahrt aufzeichnet.
//
// Bewusst Web Crypto und nicht node:crypto: dieselbe Datei wird vom Server
// (Server Action) und in den Tests unter Node geladen, und beide kennen
// globalThis.crypto seit Node 18.

/** Länge des Geheimnisses in Bytes; als Hex also doppelt so viele Zeichen. */
const GEHEIMNIS_BYTES = 32;

/** Hex-Länge von Geheimnis und Abdruck — beides 32 Bytes, beides 64 Zeichen. */
export const GEHEIMNIS_LAENGE = GEHEIMNIS_BYTES * 2;
export const ABDRUCK_LAENGE = 64;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Ein neues Ticket-Geheimnis: 32 zufällige Bytes als Hex. */
export function erzeugeGeheimnis(): string {
  const bytes = new Uint8Array(GEHEIMNIS_BYTES);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

/**
 * Der SHA-256-Abdruck eines Geheimnisses als Hex — das, was in der Datenbank
 * liegt. Die Funktion ist absichtlich nicht gesalzen: das Geheimnis ist
 * bereits 32 Byte Zufall, eine Regenbogentabelle darüber gibt es nicht.
 */
export async function abdruckVon(geheimnis: string): Promise<string> {
  const daten = new TextEncoder().encode(geheimnis);
  const digest = await crypto.subtle.digest("SHA-256", daten);
  return hex(new Uint8Array(digest));
}

/**
 * Prüft die Form eines Geheimnisses, bevor es an die Datenbank geht.
 *
 * Nicht Paranoia, sondern Arbeitsteilung: der Wert kommt aus dem
 * localStorage-Snapshot des Browsers und hat dort alles Mögliche werden
 * können — eine abgeschnittene Zeichenkette, ein `null` als Text, der Rest
 * eines alten Formats. Was hier durchfällt, führt später sauber zu
 * dauer_quelle = "trail" statt zu einer Ausnahme aus dem Datenbanktreiber.
 */
export function istGeheimnis(wert: unknown): wert is string {
  return typeof wert === "string" && new RegExp(`^[0-9a-f]{${GEHEIMNIS_LAENGE}}$`).test(wert);
}

/** Dieselbe Prüfung für eine Ticket-ID (UUID v4, wie gen_random_uuid() sie liefert). */
export function istTicketId(wert: unknown): wert is string {
  return (
    typeof wert === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wert)
  );
}

/** Was der Client zwischen Start und Speichern mit sich trägt. */
export interface FahrtStartTicket {
  id: string;
  geheimnis: string;
}

/** Liest ein Ticket aus unbekannten Daten (Snapshot, Formularfeld). */
export function leseTicket(wert: unknown): FahrtStartTicket | null {
  if (!wert || typeof wert !== "object") return null;
  const { id, geheimnis } = wert as Record<string, unknown>;
  if (!istTicketId(id) || !istGeheimnis(geheimnis)) return null;
  return { id, geheimnis };
}

// ---------------------------------------------------------------------------
// Pulsschläge (0098_fahrtstart_puls.sql)
// ---------------------------------------------------------------------------
// Während der Aufzeichnung meldet der Client seine Position an den Server.
// Die gewertete Dauer ist danach `letzter Puls − Start`, beides Serverzeiten,
// und der Trigger verlangt, dass der letzte Puls am Ende des eingereichten
// Tracks liegt. Damit bringt es nichts mehr, das Ticket mitten in der Fahrt
// einzulösen: die Uhr hängt nicht am Einlösen, sondern am letzten Puls.

/**
 * Abstand zwischen zwei Pulsen.
 *
 * 20 Sekunden sind ein Kompromiss zwischen Datenverkehr und der Toleranz im
 * Trigger: geht der Schlusspuls verloren, zählt der letzte davor, und der ist
 * höchstens ein Intervall alt — bei 90 km/h also rund 500 m zurück, was genau
 * der Toleranz dort entspricht. Ein längeres Intervall würde die Toleranz
 * aufweichen müssen, ein kürzeres kostet Funk und Akku, ohne etwas zu gewinnen.
 *
 * Die Datenbank weist Pulse ab, die enger als 5 Sekunden aufeinander folgen —
 * diese Zahl muss deutlich darunter bleiben.
 */
export const PULS_INTERVALL_MS = 20_000;

/**
 * Verkürztes Intervall bei hohem Tempo: Bei 90 km/h legt ein 20-s-Intervall
 * 500 m zurück — genau die Toleranz des Triggers. Wer schnell fährt, pulst
 * deshalb alle 10 s, damit ein verlorener Schlusspuls weniger kostet. Weiter
 * als 10 s geht es nie herunter (Datenbank-Bremse: nichts unter 5 s).
 */
export const PULS_INTERVALL_SCHNELL_MS = 10_000;

/** Ab diesem Tempo gilt das verkürzte Intervall. */
export const PULS_SCHNELL_AB_KMH = 50;

/**
 * Ist es Zeit für den nächsten Puls?
 *
 * `letzterPulsMs` ist null, solange keiner gesendet wurde — dann sofort.
 * Bewusst eine reine Funktion statt eines `setInterval`: gepulst wird aus dem
 * GPS-Handler heraus, also nur dann, wenn es auch eine Position zu melden
 * gibt. Ein Timer würde weiterlaufen, während das Gerät gar keinen Fix hat,
 * und den Server mit der zuletzt bekannten Position beliefern — die dann im
 * Trigger als „passt zum Trackende" durchginge, obwohl niemand gefahren ist.
 */
export function sollPulsen(
  letzterPulsMs: number | null,
  jetztMs: number,
  tempoKmh: number | null = null,
): boolean {
  if (letzterPulsMs === null) return true;
  const intervall =
    tempoKmh !== null && tempoKmh >= PULS_SCHNELL_AB_KMH
      ? PULS_INTERVALL_SCHNELL_MS
      : PULS_INTERVALL_MS;
  return jetztMs - letzterPulsMs >= intervall;
}

/**
 * Ist dieser Fehler eines Fahrtstart-Aufrufs die fehlende Berechtigung eines
 * Gasts — darf die Server Action also auf den Service-Role-Client
 * ausweichen (lib/actions/fahrtstart.ts, 0133_gastticket_bremse.sql)?
 *
 * 42501 ist "permission denied for function": anon hat seit 0133 kein
 * EXECUTE mehr. PGRST202 ("function not found") kommt dazu, falls PostgREST
 * eine Funktion ohne EXECUTE gar nicht erst im Schema-Cache führt.
 *
 * Bewusst NICHT dabei: Fehler eines ungültigen oder abgelaufenen Tokens
 * (PGRST301/PGRST303) und alles aus der Funktion selbst ("Zu viele
 * Fahrtstarts" ist P0001). Wer ein kaputtes Sitzungs-Cookie schickt, soll
 * nicht still als Gast weiterlaufen, und eine Grenze der Datenbank soll kein
 * zweiter Aufruf umgehen.
 */
export function istGastSperre(fehler: { code?: string | null } | null | undefined): boolean {
  return fehler?.code === "42501" || fehler?.code === "PGRST202";
}
