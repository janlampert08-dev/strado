import type { TrailPoint } from "@/lib/geo";

export interface TrackingSnapshot {
  phase: "tracking" | "finished";
  trail: TrailPoint[];
  distanceKm: number;
  hasStarted: boolean;
  hasLeftStart: boolean;
  startTimeMs: number | null;
  savedAt: number;
  // Nur gesetzt, wenn phase === "finished" — die beim Stoppen final
  // berechnete Fahrzeit (siehe handleStop in LiveTrackingForm.tsx). Für
  // "tracking" wird die verstrichene Zeit beim Wiederaufnehmen stattdessen
  // live aus startTimeMs neu berechnet.
  seconds: number | null;
}

// Schlüssel je Aufzeichnung: bei einer Streckenfahrt die Strecken-ID, bei
// einer freien Fahrt der feste Wert FREE_RIDE_STORAGE_KEY — so überschreiben
// sich die beiden Arten nicht gegenseitig.
export const FREE_RIDE_STORAGE_KEY = "frei";

// Platzhalter-"Nutzer" für eine Aufzeichnung ohne Konto: abgemeldete
// Besucher dürfen eine freie Fahrt aufzeichnen, gespeichert wird sie aber
// erst nach der Anmeldung (siehe FreeRideForm.tsx). Bis dahin braucht der
// Snapshot einen Schlüssel — und zwar einen eigenen, damit eine Gastfahrt
// nicht den unterbrochenen Stand eines angemeldeten Kontos auf demselben
// Browser überschreibt. Kollidiert nicht mit einer echten Nutzer-ID: die
// sind UUIDs.
export const GUEST_TRACKING_USER_ID = "gast";

// Der Schlüssel enthält die Nutzer-ID. Ohne sie teilen sich alle Konten auf
// demselben Browser denselben Eintrag: wer eine Aufzeichnung abbricht und
// sich abmeldet, hinterlässt seinen vollständigen GPS-Verlauf für den
// nächsten Nutzer — der ihn beim Öffnen derselben Seite wiederaufnehmen und
// unter seinem eigenen Konto speichern könnte. localStorage überlebt das
// Abmelden (supabase.auth.signOut räumt nur die Session ab), deshalb muss
// die Trennung im Schlüssel stecken.
function key(userId: string, storageKey: string): string {
  return `cornice:tracking:${userId}:${storageKey}`;
}

// Ein Snapshot, der älter als das ist, wird nicht mehr wiederaufgenommen:
// eine vor Tagen abgebrochene Aufzeichnung soll nicht unvermittelt wieder
// auftauchen, wenn dieselbe Strecke erneut geöffnet wird. Grosszügig genug,
// dass eine offline beendete Fahrt am nächsten Tag noch gespeichert werden
// kann.
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Absichtlich fehlertolerant statt die Aufzeichnung daran scheitern zu
// lassen: localStorage kann in Private-Browsing-Kontexten oder bei vollem
// Speicher werfen — Tracking soll auch dann weiterlaufen, nur ohne
// Crash-Wiederherstellung.
export function saveTrackingSnapshot(
  userId: string,
  storageKey: string,
  snapshot: TrackingSnapshot,
): void {
  try {
    localStorage.setItem(key(userId, storageKey), JSON.stringify(snapshot));
  } catch {
    // Speichern übersprungen — Aufzeichnung läuft im Speicher trotzdem weiter.
  }
}

export function loadTrackingSnapshot(
  userId: string,
  storageKey: string,
): TrackingSnapshot | null {
  try {
    const raw = localStorage.getItem(key(userId, storageKey));
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as TrackingSnapshot;
    if (Date.now() - snapshot.savedAt > SNAPSHOT_MAX_AGE_MS) {
      localStorage.removeItem(key(userId, storageKey));
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

// Entfernt Snapshots aus der Zeit vor der Nutzertrennung
// (`cornice:tracking:<fahrt>` statt `cornice:tracking:<nutzer>:<fahrt>`).
// Sie werden nie wieder gelesen, enthalten aber möglicherweise den GPS-Verlauf
// einer anderen Person auf einem geteilten Gerät — sie sollen nicht dauerhaft
// im Browser liegen bleiben. Am neuen Schlüssel erkennbar: dort steht hinter
// dem Präfix genau ein weiterer Doppelpunkt.
export function purgeLegacyTrackingSnapshots(): void {
  try {
    const prefix = "cornice:tracking:";
    const veraltet: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const storedKey = localStorage.key(i);
      if (!storedKey?.startsWith(prefix)) continue;
      if (!storedKey.slice(prefix.length).includes(":")) veraltet.push(storedKey);
    }
    for (const storedKey of veraltet) localStorage.removeItem(storedKey);
  } catch {
    // Kein Zugriff auf localStorage — dann gibt es auch nichts aufzuräumen.
  }
}

// Übergibt eine als Gast aufgezeichnete Fahrt an das Konto, das sich
// gerade dafür angemeldet hat (Rückkehr auf /fahrten/neu?fortsetzen=1 nach
// dem Anmelde-Gate im Fazit-Screen). Ohne diesen Schritt wäre die Fahrt nach
// der Anmeldung verloren: der Snapshot liegt unter dem Gast-Schlüssel, der
// Recorder sucht aber unter der Nutzer-ID (siehe key()).
//
// Bewusst nicht automatisch bei jedem Mount: der Schlüssel enthält die
// Nutzer-ID genau deshalb, weil ein liegengebliebener GPS-Verlauf auf einem
// geteilten Gerät nicht dem nächsten Konto angeboten werden darf. Diese
// Übergabe passiert nur auf ausdrückliche Anforderung des Aufrufers, und
// gespeichert wird auch danach nichts von selbst — der Nutzer sieht das
// Fazit und drückt "Fahrt speichern".
//
// Ein bereits vorhandener eigener Snapshot gewinnt: die unterbrochene
// eigene Aufzeichnung ist die relevantere und wird nicht überschrieben.
// Gibt zurück, ob übernommen wurde.
export function adoptGuestTrackingSnapshot(userId: string, storageKey: string): boolean {
  if (userId === GUEST_TRACKING_USER_ID) return false;
  const guestSnapshot = loadTrackingSnapshot(GUEST_TRACKING_USER_ID, storageKey);
  if (!guestSnapshot) return false;
  if (loadTrackingSnapshot(userId, storageKey)) return false;

  saveTrackingSnapshot(userId, storageKey, guestSnapshot);
  clearTrackingSnapshot(GUEST_TRACKING_USER_ID, storageKey);
  return true;
}

export function clearTrackingSnapshot(userId: string, storageKey: string): void {
  try {
    localStorage.removeItem(key(userId, storageKey));
  } catch {
    // Nichts zu tun — beim nächsten Start wird ein veralteter Snapshot
    // ohnehin durch einen neuen überschrieben.
  }
}
