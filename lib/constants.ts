/** Der Claim, wie er überall in der App steht — eine Quelle, kein Wildwuchs. */
export const SLOGAN = "Für alle, die den Umweg nehmen.";
/**
 * Kurzbeschreibung für Metadaten und Manifest — knapp, mit den Suchbegriffen.
 *
 * "in der ganzen Schweiz" statt des früheren "rund um Zürich", aus demselben
 * Grund wie der Titel in app/page.tsx: dieser Satz steht als description
 * direkt unter jenem Titel. Ein Titel, der die Schweiz nennt, und eine
 * Beschreibung, die eine einzelne Region nennt, sind dasselbe Suchergebnis
 * mit zwei Aussagen — und die Beschreibung ist die Hälfte, die im
 * Google-Snippet und in jeder Link-Vorschau ausgeschrieben wird.
 *
 * "Pass" bleibt vorne: es ist der Suchbegriff, mit dem in der Schweiz nach
 * genau diesen Strassen gesucht wird, und zugleich der Beleg dafür, dass
 * hier nicht eine internationale Datenbank mit Schweizer Filter steht.
 */
export const BESCHREIBUNG =
  "Handverlesene Pass-, Kurven- und Aussichtsstrecken in der ganzen Schweiz. Fahrten per GPS aufzeichnen, vergleichen, teilen.";

// Geografischer Standard-Mittelpunkt, solange die Karte nichts Besseres
// weiss: die Mitte des Landes (Älggialp OW, der geografische Mittelpunkt
// der Schweiz) statt wie früher Zürich HB.
//
// Das ist in beiden Aufrufern nur der erste Frame: ExploreView/RouteMap
// passt via fitBounds auf die tatsächlich geladenen Strecken ein, sobald sie
// da sind, und RoutePicker zentriert auf den Standort der Nutzerin, sobald
// die Ortung antwortet. Sichtbar bleibt er dort, wo weder das eine noch das
// andere vorliegt — und dann soll das Land zu sehen sein, nicht ein Kanton.
export const SCHWEIZ_ZENTRUM: [number, number] = [8.2306, 46.8014];

// Zoomstufe, auf der die Schweiz als Ganzes ins Bild passt (vorher 10.5, der
// Ausschnitt für den Raum Zürich). Die Ost-West-Ausdehnung des Landes von
// rund 4.5 Längengraden ist der bindende Wert.
//
// 5.9 und nicht 6.9: Mapbox GL JS rechnet seine Zoomstufen auf 512-px-Kacheln,
// nicht auf die 256 px, mit denen Google Maps und Leaflet ihre Stufen zählen.
// Dieselbe Zahl zeigt hier also den halben Ausschnitt — die Stufen sind um
// genau eine versetzt. Gemessen (Chromium, Viewport 390 px breit,
// map.getBounds()):
//
//   Stufe 6.9 -> 2.30° sichtbar (7.08°E bis 9.38°E)
//   Stufe 5.9 -> 4.59° sichtbar (5.93°E bis 10.53°E)
//
// Bei 6.9 lagen Genf (6.14°E) und das Engadin (St. Moritz 9.84°E, Val Müstair
// 10.49°E) ausserhalb des Bildes: der erste Blick auf eine schweizweite App
// zeigte das Mittelland. Bei 5.9 passt das Land mit etwas Luft hinein.
//
// In beiden Aufrufern ist das nur der erste Frame — RouteMap passt per
// fitBounds auf die geladenen Strecken ein, RoutePicker zentriert auf den
// Standort. Sichtbar ist diese Stufe also genau so lange, wie noch nichts
// davon vorliegt.
export const DEFAULT_ZOOM = 5.9;

export const KATEGORIEN = [
  { value: "kurvig", label: "Kurvig" },
  { value: "scenic", label: "Aussichtsreich" },
  { value: "passstrasse", label: "Passstrasse" },
  { value: "freie_fahrt", label: "Freie Fahrt" },
] as const;

// Gold/Silber/Bronze für die Top 3 einer Bestenliste — an mehreren Stellen
// verwendet (RouteLeaderboardPreview.tsx, app/leaderboards/page.tsx), daher
// hier zentral statt mehrfach dupliziert.
export const MEDAL_COLORS = ["#D4AF37", "#A8A9AD", "#CD7F32"] as const;

// Feste Werte statt Freitext, damit die Moderationswarteschlange (siehe
// lib/moderation.ts) filter-/auswertbar bleibt — ein optionaler
// Freitextkommentar ergänzt bei Bedarf.
//
// Bewusst hier statt in lib/actions/reports.ts: eine Datei mit der
// "use server"-Direktive darf laut Next.js/React nur async Functions
// exportieren. Eine einfache Konstante wie diese wird von der
// Client-Reference-Manifest-Transformation dieser Dateien nicht abgebildet
// und kommt im Client-Bundle als undefined an — genau das liess
// ReportDialog.tsx (Client Component) mit "REPORT_REASONS.map is not a
// function" abstürzen, sobald die Seite über einen Client-seitigen
// Navigationspfad statt eines vollen Seitenladens gerendert wurde.
export const REPORT_REASONS = [
  { value: "unangemessen", label: "Unangemessener Inhalt" },
  { value: "spam", label: "Spam" },
  { value: "falsche_angaben", label: "Falsche Angaben" },
  { value: "sonstiges", label: "Sonstiges" },
] as const;

// Leben bewusst auf der Marketing-Domain statt als eigene Routen hier —
// Erreichbarkeit per Link genügt, unabhängig vom Hosting-Ort. Die Seiten
// liegen im Repo janlampert08-dev/stradoinfo unter legal/.
//
// Der Standard ist die Adresse, unter der die Seiten HEUTE tatsächlich
// stehen, nicht die Wunschdomain. Diese Bedingung ist jetzt erfüllt:
// strado.ch ist registriert, bei Vercel eingetragen und liefert die
// Rechtstexte unter /legal/… aus (die Apex-Domain antwortet mit 308 auf
// www.strado.ch, der Pfad bleibt dabei erhalten). Deshalb steht hier
// strado.ch statt der früheren vercel.app-Adresse.
//
// Die Regel dahinter bleibt und ist der Grund, warum dieser Wert nicht
// einfach „die schönste Adresse" ist: der ursprüngliche Wert war
// https://xyz.ch/… — eine Domain, die uns nicht gehört. Das ist schlimmer
// als ein toter Link, denn sie kann jederzeit jemand anderem gehören und
// beliebige Inhalte ausliefern, während bei uns „Impressum" darübersteht.
// Eine noch nicht gekaufte oder noch nicht antwortende Wunschdomain hätte
// dieselbe Eigenschaft. Wer diesen Wert das nächste Mal ändert, prüft
// vorher, dass die neue Adresse uns gehört UND antwortet.
//
// Ein leerer Wert zählt als nicht gesetzt: .env.local.example führt die
// Variable ohne Wert, und eine daraus kopierte Datei liefert einen leeren
// String. Mit ?? bliebe der erhalten, LEGAL_BASE_URL wäre "" und aus den
// Links würden relative Pfade — die dann auf die App-Domain zeigen und dort
// ins Leere laufen, statt auf die Rechtstexte.
const LEGAL_BASE_URL_STANDARD = "https://strado.ch";

// Nur https. Ein http://-Wert würde Nutzende auf unverschlüsselt
// ausgelieferte Rechtstexte schicken — bei einem Dokument, dessen ganzer
// Zweck Verbindlichkeit ist, das falsche Signal, und unterwegs veränderbar.
//
// Bewusst KEINE Ausnahme für localhost: die Variable steuert Links auf eine
// getrennt gehostete Marketing-Seite, nicht auf diese Anwendung. In der
// Entwicklung ist der richtige Wert entweder leer (dann greift der Standard)
// oder eine echte https-Adresse.
//
// Fällt bei einem unbrauchbaren Wert auf den Standard zurück, statt zu
// werfen: diese Datei wird beim Modulladen ausgewertet, eine Ausnahme hier
// nähme die ganze Anwendung mit — wegen einer falsch gesetzten
// Umgebungsvariable für drei Links. Die Warnung landet im Serverlog.
function legaleBasisUrl(): string {
  const konfiguriert = process.env.NEXT_PUBLIC_LEGAL_BASE_URL?.trim();
  if (!konfiguriert) return LEGAL_BASE_URL_STANDARD;

  let geprueft: URL;
  try {
    geprueft = new URL(konfiguriert);
  } catch {
    console.warn(
      `NEXT_PUBLIC_LEGAL_BASE_URL ist keine gültige URL (${konfiguriert}) — Standard wird verwendet.`,
    );
    return LEGAL_BASE_URL_STANDARD;
  }

  if (geprueft.protocol !== "https:") {
    console.warn(
      `NEXT_PUBLIC_LEGAL_BASE_URL muss https sein (${konfiguriert}) — Standard wird verwendet.`,
    );
    return LEGAL_BASE_URL_STANDARD;
  }

  // Der Wert ist eine BASIS, an die /legal/… angehängt wird. Trüge er eine
  // Query oder ein Fragment, landete der Pfad darin statt im Pfadteil: aus
  // "https://strado.ch/?x=1" + "/legal/impressum" würde
  // "https://strado.ch/?x=1/legal/impressum", was auf der Startseite
  // herauskommt statt beim Impressum. Bei einem rechtlich verlangten Link
  // ist das schlimmer als ein toter Link, weil es unbemerkt bleibt.
  if (geprueft.search !== "" || geprueft.hash !== "") {
    console.warn(
      `NEXT_PUBLIC_LEGAL_BASE_URL darf keine Query und kein Fragment enthalten (${konfiguriert}) — Standard wird verwendet.`,
    );
    return LEGAL_BASE_URL_STANDARD;
  }

  return konfiguriert.replace(/\/+$/, "");
}

const LEGAL_BASE_URL = legaleBasisUrl();

export const LEGAL_URLS = {
  impressum: `${LEGAL_BASE_URL}/legal/impressum`,
  datenschutz: `${LEGAL_BASE_URL}/legal/datenschutz`,
  agb: `${LEGAL_BASE_URL}/legal/agb`,
} as const;

// Das Postfach hinter contact@strado.ch (Infomaniak kSuite) — verlinkt im
// Kopf von /moderation, direkt neben den Creator-Links. Der Anlass ist das
// Feedback weiter unten auf derselben Seite: geantwortet wird per Mail, und
// die Adresse ist zugleich der einzige Kontaktkanal, den das Impressum
// nennt (Art. 3 Abs. 1 lit. s UWG) — sie gehört also ohnehin in die Runde
// einer Moderatorin.
//
// Aus der Umgebung statt fest im Code, weil dieses Repository öffentlich
// ist: die Adresse enthält die kSuite-Kontonummer. Kein Zugangsdatum — ohne
// Anmeldung kommt dort niemand hinein —, aber nichts, was ohne Not dauerhaft
// in einer öffentlichen Historie stehen muss.
//
// Ohne NEXT_PUBLIC_-Präfix und damit erst zur Laufzeit gelesen: der Wert
// wird ausschliesslich in einer Server Component gebraucht (siehe
// app/moderation/page.tsx), und ein NEXT_PUBLIC_-Wert würde beim Build
// eingefroren (siehe die Anmerkung zu NEXT_PUBLIC_SITE_URL in AGENTS.md).
// Die Kehrseite: in einer Client Component ist die Konstante immer null.
//
// null statt "" bei fehlendem oder unbrauchbarem Wert — die Seite blendet
// den Link dann aus, statt eine kaputte Adresse anzubieten. Wie bei
// legaleBasisUrl() nur https und keine Ausnahme für localhost: das Ziel ist
// eine fremde, extern gehostete Oberfläche.
function postfachUrl(): string | null {
  const konfiguriert = process.env.MODERATION_POSTFACH_URL?.trim();
  if (!konfiguriert) return null;

  let geprueft: URL;
  try {
    geprueft = new URL(konfiguriert);
  } catch {
    console.warn(
      `MODERATION_POSTFACH_URL ist keine gültige URL (${konfiguriert}) — der Postfach-Link wird ausgeblendet.`,
    );
    return null;
  }

  if (geprueft.protocol !== "https:") {
    console.warn(
      `MODERATION_POSTFACH_URL muss https sein (${konfiguriert}) — der Postfach-Link wird ausgeblendet.`,
    );
    return null;
  }

  return geprueft.toString();
}

export const POSTFACH_URL = postfachUrl();

// Kategorien für "Feedback senden" (Einstellungen → Feedback). Feste Werte
// statt Freitext aus demselben Grund wie bei REPORT_REASONS: die Liste in
// /moderation soll sortier- und auswertbar bleiben. Die Werte sind
// gleichlautend in der CHECK-Beschränkung von 0083_feedback.sql verankert —
// wer hier einen hinzufügt, braucht dort eine neue Migration.
//
// Steht aus demselben Grund hier und nicht in lib/actions/feedback.ts: eine
// Datei mit "use server" darf nur async Functions exportieren, eine
// Konstante käme im Client-Bundle als undefined an (siehe die ausführliche
// Begründung bei REPORT_REASONS oben).
export const FEEDBACK_KATEGORIEN = [
  { value: "fehler", label: "Fehler melden" },
  { value: "idee", label: "Idee oder Wunsch" },
  { value: "lob", label: "Lob" },
  { value: "sonstiges", label: "Sonstiges" },
] as const;
