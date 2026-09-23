// Liefert der Service Worker (public/sw.js) /offline als Ersatz für eine
// gescheiterte Navigation, bleibt die Adresszeile auf der angefragten Seite —
// der App-Router übernimmt beim Hydrieren window.location als kanonische URL,
// nicht die der ausgelieferten Seite. Wer offline eine gespeicherte Strecke
// antippt (Lesezeichen, Verlauf, geteilter Link), landet also mit
// /strecken/<id> in der Adresszeile auf /offline. Diese Funktion liest die
// Strecke daraus, damit die Offline-Ansicht direkt ihr Detail zeigt statt der
// Liste, in der man sie erst wiederfinden müsste.
//
// Rein und ohne Browser-Zugriff, damit sie in Node testbar ist.
export function angefragteStreckenId(pfad: string): string | null {
  const treffer = /^\/strecken\/([^/?#]+)\/?$/.exec(pfad);
  if (!treffer) return null;
  try {
    return decodeURIComponent(treffer[1]);
  } catch {
    return null;
  }
}
