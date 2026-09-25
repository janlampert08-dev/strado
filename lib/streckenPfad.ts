// Lesbare Streckenadressen: /strecken/aecherlipass-kerns-dallenwil statt
// /strecken/1b8461e1-7eae-4262-82cf-c6827af63ae2.
//
// Der Slug entsteht in der Datenbank (0130_strecken_slugs.sql, Trigger
// strecken_slug_setzen) — einmal, bei der Freigabe, und danach nie wieder:
// ein geteilter Link muss auch dann noch stimmen, wenn die Strecke später
// umbenannt wird. Die App berechnet ihn deshalb nirgends selbst, sie liest
// ihn nur. streckenSlugBasis() unten ist trotzdem da, als Spiegel der
// SQL-Funktion strecken_slug_basis(): die Tests halten die beiden Fassungen
// an denselben Beispielen fest (lib/streckenPfad.test.ts), und wer die
// Regel an einer Stelle ändert, sieht dort, dass die andere mitmuss.
//
// Rein und ohne Server-Import: wird auch von Client-Komponenten geladen
// (Karte, Teilen-Knopf, Aufzeichnung).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dieselbe Form, die die Check-Constraint routes_slug_format erzwingt:
// Kleinbuchstaben und Ziffern, durch einzelne Bindestriche getrennt.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Obergrenze der Grundform (ohne Kollisionszusatz "-2", "-3" …). */
export const SLUG_MAX_LAENGE = 60;

// Obergrenze für einen angefragten Slug, bevor überhaupt die Datenbank
// gefragt wird: Grundform plus ein grosszügiger Zusatz. Alles darüber kann
// kein gespeicherter Slug sein.
const SLUG_ANFRAGE_MAX = SLUG_MAX_LAENGE + 10;

export function istUuid(wert: string): boolean {
  return UUID_RE.test(wert);
}

/**
 * Ob ein Pfadsegment als Slug nachgeschlagen werden darf. Eine UUID hat
 * zufällig dieselbe Zeichenform, zählt hier aber nicht — sie wird über die
 * id gesucht, nicht über den Slug (die Datenbank vergibt keinen Slug in
 * UUID-Form, siehe den Trigger in 0130).
 */
export function istGueltigerSlug(wert: string): boolean {
  return wert.length > 0 && wert.length <= SLUG_ANFRAGE_MAX && SLUG_RE.test(wert) && !istUuid(wert);
}

export type StreckenAdressteil = { art: "id"; wert: string } | { art: "slug"; wert: string } | null;

/**
 * Was im Segment von /strecken/[id] steht: eine UUID (alte Links, interne
 * Verweise ohne Slug), ein Slug, oder etwas, das keins von beidem sein kann
 * (dann 404 ohne Datenbankabfrage). UUIDs werden kleingeschrieben
 * zurückgegeben — Postgres vergleicht uuid ohnehin ohne Rücksicht auf
 * Grossschreibung, der Slug dagegen muss exakt passen.
 */
export function leseStreckenAdressteil(segment: string): StreckenAdressteil {
  if (istUuid(segment)) return { art: "id", wert: segment.toLowerCase() };
  if (istGueltigerSlug(segment)) return { art: "slug", wert: segment };
  return null;
}

/**
 * Der Pfad einer Streckenseite. Mit Slug die lesbare Adresse, ohne (Strecke
 * noch nicht freigegeben, Migration 0130 noch nicht eingespielt, oder der
 * Aufrufer kennt nur die id) die UUID — die Seite leitet von dort selbst
 * dauerhaft auf den Slug weiter, ein UUID-Link ist also nie falsch, nur
 * einen Umweg länger.
 */
export function streckenPfad(route: { id: string; slug?: string | null }): string {
  const slug = route.slug?.trim();
  return `/strecken/${slug && istGueltigerSlug(slug) ? slug : route.id}`;
}

/**
 * Ob ein PostgREST-Fehler bloss sagt, dass es routes.slug / routes_geojson.slug
 * noch nicht gibt (0130 nicht eingespielt). Dann fragt der Aufrufer ohne die
 * Spalte nochmals — dasselbe Muster wie EXPLORE_SPALTEN_LEGACY für 0117
 * (lib/routes.ts).
 * Postgres meldet 42703 ("column … does not exist"); die Nachricht wird
 * zusätzlich geprüft, damit ein anderer fehlender Spaltenname nicht als
 * "slug fehlt" durchgeht.
 */
export function fehltSlugSpalte(fehler: { code?: string; message?: string } | null): boolean {
  if (!fehler) return false;
  return /\bslug\b/i.test(fehler.message ?? "") && (fehler.code === "42703" || /does not exist|could not find/i.test(fehler.message ?? ""));
}

// --- Weiterleitung alter UUID-Adressen (proxy.ts) ---------------------------

// Die Seiten unter /strecken/<uuid>, die auf den Slug umziehen: die
// Streckenseite selbst und /bearbeiten. Nicht dabei: opengraph-image (das
// Bild hängt an der Seite, die es einbindet — die nennt schon den Slug) und
// /geometrie (versionierte Adresse aus lib/streckenGeometrie.ts, bewusst an
// der id; ein Umweg kostete dort nur einen Roundtrip ohne Gewinn).
const UUID_SEITE_RE =
  /^\/strecken\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/bearbeiten)?\/?$/i;

/**
 * Ob ein Pfad eine Streckenseite unter ihrer UUID ist, und wenn ja, welche
 * id und welcher Unterpfad ("" oder "/bearbeiten").
 */
export function leseUuidStreckenseite(pfad: string): { id: string; unterpfad: string } | null {
  const treffer = UUID_SEITE_RE.exec(pfad);
  if (!treffer) return null;
  return { id: treffer[1].toLowerCase(), unterpfad: treffer[2] ?? "" };
}

/**
 * Das Ziel der dauerhaften Weiterleitung: derselbe Unterpfad, dieselbe
 * Query (?fortsetzen= aus dem Gast-Handoff, ?privat= aus proposeRoute
 * müssen ankommen), nur mit dem Slug statt der UUID. null, wenn der Slug
 * keiner ist, den die Seite auch wieder auflöst — dann lieber keine
 * Weiterleitung als eine ins Leere.
 */
export function slugWeiterleitungsZiel(unterpfad: string, suche: string, slug: string | null | undefined): string | null {
  if (!slug || !istGueltigerSlug(slug)) return null;
  return `/strecken/${slug}${unterpfad}${suche}`;
}

// --- Spiegel der SQL-Funktionen aus 0130 -----------------------------------

// Die Umschrift der Umlaute zuerst (ä → ae statt ä → a: "Flüelapass" ist in
// der Schweiz "fluelapass" nur für Leute, die es nicht aussprechen), danach
// die übrigen Akzente auf den Grundbuchstaben. Bewusst eine feste Tabelle
// statt Unicode-Normalisierung (NFD): Postgres hat unaccent hier nicht
// installiert, und die Tabelle ist genau die, die translate() in der
// Migration bekommt — so können die beiden Fassungen nicht auseinanderlaufen.
const ERSETZUNGEN: [string, string][] = [
  ["ä", "ae"],
  ["ö", "oe"],
  ["ü", "ue"],
  ["ß", "ss"],
  ["æ", "ae"],
  ["œ", "oe"],
];
export const AKZENTE_VON = "àáâãåāèéêëēìíîïīòóôõøōùúûūýÿñçčšžł";
export const AKZENTE_NACH = "aaaaaaeeeeeiiiiioooooouuuuyynccszl";

/** Ein einzelner Text als Slug-Teil — Spiegel von strecken_slug_text(). */
export function slugTeil(text: string | null | undefined): string {
  let s = (text ?? "").toLowerCase();
  for (const [von, nach] of ERSETZUNGEN) s = s.split(von).join(nach);
  let umgeschrieben = "";
  for (const zeichen of s) {
    const i = AKZENTE_VON.indexOf(zeichen);
    umgeschrieben += i >= 0 ? AKZENTE_NACH[i] : zeichen;
  }
  return umgeschrieben.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Die Grundform des Slugs — Spiegel von strecken_slug_basis().
 *
 * Punkt-zu-Punkt: name-start-ziel ("aecherlipass-kerns-dallenwil").
 * Rundfahrt (Start- gleich Zielort, ohne Rücksicht auf Grossschreibung):
 * name-rundfahrt-ab-start ("albis-loop-rundfahrt-ab-langnau-am-albis").
 * Über SLUG_MAX_LAENGE Zeichen wird am letzten Bindestrich davor
 * abgeschnitten, damit kein halbes Wort am Ende steht.
 *
 * Eindeutig wird der Slug erst in der Datenbank (Zusatz -2, -3 …).
 */
export function streckenSlugBasis(name: string, startOrt: string, zielOrt: string): string {
  const n = slugTeil(name) || "strecke";
  const s = slugTeil(startOrt);
  const z = slugTeil(zielOrt);
  const rundfahrt = startOrt.trim().toLowerCase() === zielOrt.trim().toLowerCase();

  let r = rundfahrt
    ? s
      ? `${n}-rundfahrt-ab-${s}`
      : n
    : [n, s, z].filter(Boolean).join("-");

  if (r.length > SLUG_MAX_LAENGE) {
    r = r.slice(0, SLUG_MAX_LAENGE + 1).replace(/-[^-]*$/, "");
    if (r.length > SLUG_MAX_LAENGE) r = r.slice(0, SLUG_MAX_LAENGE);
    r = r.replace(/^-+|-+$/g, "");
  }
  return r;
}
