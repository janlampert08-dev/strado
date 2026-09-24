// Merker "die Hinweise vor der ersten Fahrt wurden auf diesem Gerät gezeigt".
//
// localStorage und nicht das Konto, anders als der Abschluss der Einrichtung
// (lib/einrichtung.ts): die Hinweise handeln vom Gerät — Standortfreigabe,
// Bildschirmsperre, Halterung. Wer auf einem neuen Handy fährt, braucht sie
// dort wieder, auch wenn er sie am alten schon gesehen hat. Und Gäste haben
// kein Konto, fahren aber genauso.

const SCHLUESSEL = "strado:erste-fahrt-hinweise";
const ereignis = "strado:erste-fahrt-hinweise";

export function ersteFahrtHinweiseGesehen(): boolean {
  try {
    return localStorage.getItem(SCHLUESSEL) !== null;
  } catch {
    // Kein Speicher (Private Browsing): dann eben jedes Mal zeigen — lieber
    // einmal zu oft erklärt als eine Fahrt ohne Standort begonnen.
    return false;
  }
}

export function merkeErsteFahrtHinweiseGesehen(): void {
  try {
    localStorage.setItem(SCHLUESSEL, new Date().toISOString());
    window.dispatchEvent(new Event(ereignis));
  } catch {
    // Nicht schreibbar — siehe oben.
  }
}

/** Für useSyncExternalStore: meldet Änderungen aus diesem und anderen Tabs. */
export function abonniereErsteFahrtHinweise(callback: () => void): () => void {
  window.addEventListener(ereignis, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(ereignis, callback);
    window.removeEventListener("storage", callback);
  };
}
