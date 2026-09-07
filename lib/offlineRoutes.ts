import type { HoehenprofilPunkt } from "@/types/database";

// Bewusst nur die für eine Offline-Detailanzeige nötigen Felder — keine
// Live-Daten (Wetter, Verkehr, Fotos, Bewertungen) und keine Kartenkacheln
// (Mapbox-Kacheln offline zu cachen wäre lizenzrechtlich/technisch ein
// eigenes, deutlich grösseres Vorhaben; siehe public/sw.js für dieselbe
// bewusste Einschränkung auf Seitenebene). Statt der Karte zeigt die
// Offline-Ansicht die vorhandene SVG-Routenform (lib/routeShape.ts).
export interface OfflineRoute {
  id: string;
  name: string;
  region: string;
  startOrt: string;
  zielOrt: string;
  laengeKm: number;
  hoeheM: number | null;
  maxSteigungProzent: number | null;
  kehren: number | null;
  charakterText: string | null;
  hoehenprofil: HoehenprofilPunkt[] | null;
  geometryCoordinates: [number, number][];
  gespeichertAm: string;
}

const DB_NAME = "cornice-offline";
const DB_VERSION = 1;
const STORE_NAME = "routes";

// Kein IndexedDB-Wrapper-Paket — die native Callback-API ist für die
// Handvoll hier benötigten Operationen (put/delete/get/getAll auf einem
// einzigen Object Store) klein genug, um sie direkt in Promises zu kapseln.
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = fn(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOfflineRoute(route: OfflineRoute): Promise<void> {
  await withStore("readwrite", (store) => store.put(route));
}

/** Ergebnis von saveOfflineRouteMitGrenze. */
export type OfflineSpeicherErgebnis = "gespeichert" | "kontingent_erschoepft";

/**
 * Speichert eine Strecke, sofern das Kontingent es zulässt — Zählen und
 * Schreiben in EINER IndexedDB-Transaktion.
 *
 * Warum nicht erst zählen und dann speichern: zwei offene Tabs sähen beide
 * dieselbe Zahl, kämen beide durch und legten zusammen mehr Strecken an, als
 * die Grenze erlaubt. IndexedDB serialisiert Transaktionen auf demselben
 * Store, also entscheidet hier genau eine.
 *
 * Das ist kein Sicherheitsmechanismus und soll keiner sein: die Daten liegen
 * in der IndexedDB des eigenen Browsers, kosten uns nichts, und wer die
 * Grenze über die Entwicklerkonsole umgeht, füllt seinen eigenen
 * Gerätespeicher. Es geht darum, dass die angezeigte Grenze auch stimmt.
 *
 * `grenze === null` heisst unbegrenzt (Premium) — dann wird nur geschrieben.
 */
export async function saveOfflineRouteMitGrenze(
  route: OfflineRoute,
  grenze: number | null,
): Promise<OfflineSpeicherErgebnis> {
  if (grenze === null) {
    await saveOfflineRoute(route);
    return "gespeichert";
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Die eigene Kennung zählt nicht als neuer Platz: eine bereits
    // gespeicherte Strecke zu aktualisieren muss immer erlaubt bleiben.
    const vorhandene = store.getAllKeys();
    let ergebnis: OfflineSpeicherErgebnis = "gespeichert";

    vorhandene.onsuccess = () => {
      const schluessel = vorhandene.result as IDBValidKey[];
      const schonGespeichert = schluessel.some((k) => k === route.id);
      if (!schonGespeichert && schluessel.length >= grenze) {
        ergebnis = "kontingent_erschoepft";
        // Nicht abort(): der Abbruch wäre ein Fehlerpfad für einen Fall, der
        // keiner ist. Die Transaktion läuft ohne Schreibvorgang aus.
        return;
      }
      store.put(route);
    };
    vorhandene.onerror = () => reject(vorhandene.error);

    tx.oncomplete = () => resolve(ergebnis);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function removeOfflineRoute(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function getOfflineRoute(id: string): Promise<OfflineRoute | null> {
  const result = await withStore<OfflineRoute | undefined>("readonly", (store) => store.get(id));
  return result ?? null;
}

export async function getAllOfflineRoutes(): Promise<OfflineRoute[]> {
  return withStore("readonly", (store) => store.getAll());
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
