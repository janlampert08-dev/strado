const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Alle IDs in dieser App (Strecken, Fahrten, Bewertungen, Nutzer, Fahrzeuge)
// sind Postgres-uuid-Spalten. Ein früher Format-Check vermeidet unnötige
// DB-Roundtrips für offensichtlich manipulierte oder fehlerhafte IDs, bevor
// sie überhaupt in eine Query eingesetzt werden.
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Erlaubte Bildformate für Uploads. Deckungsgleich mit
// storage.buckets.allowed_mime_types aus
// 0033_route_length_and_upload_mime_hardening.sql — die Datenbank ist die
// eigentliche Sperre, diese Liste hält die App-Seite damit im Gleichklang.
// Bewusst eine Map und kein Objekt-Literal: bei einem Objekt liegt die
// gesamte Object.prototype-Kette im Lookup, und foto.type ist
// client-kontrolliert. Ein Upload mit Content-Type "constructor" oder
// "toString" liefert dort einen geerbten Wert statt undefined, das ?? null
// unten greift nicht, und die geratene "Endung" landet im Storage-Key.
const BILD_MIME_ZU_ENDUNG = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

// Liefert die Dateiendung für einen Storage-Key aus dem gemeldeten
// Content-Type statt aus foto.name.
//
// Zwei Gründe, den Dateinamen nicht zu verwenden:
// 1. Er ist client-kontrolliert und ungefiltert — "a.png/x/y" ergäbe den
//    Key "{uid}/avatar.png/x/y". Ausbrechen lässt sich damit nicht, die
//    Storage-Policies binden das erste Pfadsegment an auth.uid()
//    (0003_storage.sql, 0061), aber es entstehen beliebig viele Objekte im
//    eigenen Ordner.
// 2. Beim Avatar hebelt eine wechselnde Endung das upsert aus: jedes neue
//    Bild mit anderer Endung legt ein zusätzliches Objekt an, statt das
//    alte zu ersetzen — die Altbestände bleiben im öffentlichen Bucket
//    liegen.
//
// Ein unbekannter Typ ergibt null; der Aufrufer weist den Upload dann ab,
// statt ihn unter einer geratenen Endung zu speichern.
export function bildEndungFuerMime(mimeType: string): string | null {
  return BILD_MIME_ZU_ENDUNG.get(mimeType.toLowerCase()) ?? null;
}
