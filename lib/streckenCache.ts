import { unstable_cache, updateTag } from "next/cache";

// Anfrageübergreifender Cache für den ÖFFENTLICHEN Streckenbestand:
// freigegeben (status_ok) und nicht privat. Das lasen Startseite und
// Streckenseite bisher bei jeder Anfrage neu, die Streckenseite gleich
// dreimal (Kontext-Strecken, Signaturbestand, Nachbarstrecken) — über den
// Cookie-Client, also als die jeweilige Person.
//
// Warum das ohne Leck geht:
//   * Die Abfragen im Cache laufen über createAnonClient()
//     (lib/supabase/anon.ts): keine Sitzung, RLS gibt nur
//     status_ok = true and ist_privat = false heraus. Dazu filtern sie
//     ist_privat = false noch einmal selbst.
//   * Für angemeldete Personen ändert sich nichts. Die Lese-Policy auf
//     routes (0139) zeigt zusätzlich eigene Strecken und — Moderatoren —
//     nicht-private unfreigegebene, aber alle Aufrufer filtern auf
//     status_ok = true. Eine eigene freigegebene PRIVATE Strecke gibt es
//     nicht: propose_route_full und die INSERT-Policy setzen status_ok =
//     false, die Besitzer-UPDATE-Policy verbietet das Selbst-Freischalten,
//     und Moderatoren sehen private Strecken nicht (0049, dort nachgemessen;
//     erneut geprüft 2026-09-24: 2 private, beide status_ok = false). Mit
//     status_ok = true sieht also jede Rolle dieselbe Menge wie anon.
//
// Warum unstable_cache und nicht "use cache": "use cache" verlangt
// cacheComponents in next.config.ts, und das stellt das Rendering aller
// Seiten um. unstable_cache ist in Next 16 durch "use cache" abgelöst, aber
// weiter unterstützt, und kommt ohne diese Umstellung aus
// (node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md).
//
// Frische: Tag plus kurze Lebensdauer. Die Server Actions, die an
// freigegebenen Strecken etwas ändern (Freischalten, Ablehnen, Bearbeiten,
// Löschen durch Moderatoren), rufen oeffentlicheStreckenGeaendert() auf.
// Die Lebensdauer fängt alles, was an diesen Actions vorbei schreibt
// (Skripte, SQL von Hand).

export const STRECKEN_CACHE_TAG = "strecken-oeffentlich";
export const STRECKEN_CACHE_SEKUNDEN = 120;

/**
 * Hüllt eine Abfrage des öffentlichen Bestands in den Cache. `schluessel`
 * muss je Abfrage eindeutig sein. Die Funktion darf keine Cookies, Header
 * oder Sitzung lesen — nur createAnonClient().
 *
 * Fehler werfen, nicht als Ergebnis zurückgeben: unstable_cache speichert
 * nur, was zurückkommt, und ein leeres Ergebnis nach einem Ladefehler soll
 * nicht zwei Minuten lang allen ausgeliefert werden.
 */
export function oeffentlichGecacht<T>(schluessel: string, abfrage: () => Promise<T>): () => Promise<T> {
  return unstable_cache(abfrage, ["strecken", schluessel], {
    revalidate: STRECKEN_CACHE_SEKUNDEN,
    tags: [STRECKEN_CACHE_TAG],
  });
}

/**
 * Nach einer Änderung an einer freigegebenen Strecke — nur aus Server
 * Actions (updateTag wirft sonst). updateTag statt revalidateTag(…, "max"):
 * die nächste Anfrage wartet auf frische Daten, statt noch einmal den alten
 * Stand zu bekommen. Eine abgelehnte oder gelöschte Strecke soll nicht
 * weiter auf der Karte stehen, und wer freischaltet, will sie sofort sehen.
 */
export function oeffentlicheStreckenGeaendert() {
  updateTag(STRECKEN_CACHE_TAG);
}
