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
