import { createAdminClient } from "@/lib/supabase/admin";

export const ROUTE_PHOTOS_BUCKET = "route-photos";

// Gültigkeitsdauer der signierten Foto-Links. Lang genug, dass eine geöffnete
// Seite nicht mitten im Betrachten ungültig wird (auch nicht in einem Tab,
// der eine Weile offen liegt), kurz genug, dass ein weitergegebener Link
// nicht dauerhaft funktioniert — genau das war ja das Problem.
export const FOTO_LINK_GUELTIGKEIT_SEKUNDEN = 60 * 60;

const BUCKET_MARKER = `/${ROUTE_PHOTOS_BUCKET}/`;

// Gespeichert ist in completion_photos.foto_url weiterhin die frühere
// öffentliche URL. Sie dient ab jetzt nur noch als Träger des Storage-Pfads;
// abrufbar ist sie nicht mehr, seit der Bucket privat ist.
export function fotoPfadAusUrl(url: string): string | null {
  const index = url.indexOf(BUCKET_MARKER);
  if (index === -1) return null;
  const pfad = url.slice(index + BUCKET_MARKER.length);
  return pfad.length > 0 ? pfad : null;
}

// Signiert die übergebenen Foto-URLs.
//
// Bewusst mit dem Service-Role-Client: die Berechtigung ist an dieser Stelle
// bereits geklärt, und zwar in SQL. Die Aufrufer lesen ihre Zeilen entweder
// aus einer View, die ausschliesslich öffentliche Fahrten enthält
// (route_photos, public_completion_photos), oder aus completion_photos unter
// RLS, die nur die eigenen Zeilen herausgibt. Ein Client-Zugriff auf den
// Bucket ist dagegen auf den eigenen Ordner beschränkt (siehe Migration
// 0061) — der Server signiert, weil nur er die Sichtbarkeit einer fremden,
// öffentlichen Fahrt beurteilen kann.
//
// Liefert eine Zuordnung Original-URL -> signierte URL. Nicht zuordenbare
// oder fehlgeschlagene Einträge fehlen in der Map; der Aufrufer entscheidet,
// was er damit macht.
export async function signiereFotoUrls(urls: string[]): Promise<Map<string, string>> {
  const ergebnis = new Map<string, string>();
  if (urls.length === 0) return ergebnis;

  // Doppelte Pfade nur einmal signieren lassen und den Rückweg zur
  // ursprünglichen URL behalten.
  const pfadZuUrls = new Map<string, string[]>();
  for (const url of urls) {
    const pfad = fotoPfadAusUrl(url);
    if (!pfad) continue;
    const vorhandene = pfadZuUrls.get(pfad);
    if (vorhandene) vorhandene.push(url);
    else pfadZuUrls.set(pfad, [url]);
  }
  if (pfadZuUrls.size === 0) return ergebnis;

  const pfade = [...pfadZuUrls.keys()];
  const { data, error } = await createAdminClient()
    .storage.from(ROUTE_PHOTOS_BUCKET)
    .createSignedUrls(pfade, FOTO_LINK_GUELTIGKEIT_SEKUNDEN);

  if (error || !data) {
    // Ohne signierte Links bleibt die Galerie leer statt kaputt. Das ist
    // sichtbar und wird protokolliert — ein stiller Teilausfall, bei dem
    // einzelne Fotos ohne Spur verschwinden, wäre schwerer zu bemerken.
    console.error("Foto-Links konnten nicht signiert werden", error);
    return ergebnis;
  }

  for (const eintrag of data) {
    if (eintrag.error || !eintrag.signedUrl || !eintrag.path) continue;
    for (const url of pfadZuUrls.get(eintrag.path) ?? []) {
      ergebnis.set(url, eintrag.signedUrl);
    }
  }

  return ergebnis;
}

// Bequemlichkeit für den häufigen Fall: eine Liste Zeilen mit einer
// URL-Eigenschaft in dieselbe Liste mit signierten URLs überführen. Zeilen,
// deren Link sich nicht signieren liess, fallen heraus — ein sichtbar
// kaputtes Bild ist für niemanden nützlich.
export async function mitSigniertenFotoUrls<T>(
  zeilen: T[],
  urlVon: (zeile: T) => string,
  mitUrl: (zeile: T, url: string) => T,
): Promise<T[]> {
  if (zeilen.length === 0) return [];
  const signiert = await signiereFotoUrls(zeilen.map(urlVon));
  return zeilen
    .map((zeile) => {
      const url = signiert.get(urlVon(zeile));
      return url ? mitUrl(zeile, url) : null;
    })
    .filter((zeile): zeile is T => zeile !== null);
}
