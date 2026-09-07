// Geografischer Standard-Mittelpunkt: Zürich HB.
export const ZURICH_CENTER: [number, number] = [8.5417, 47.3769];
export const DEFAULT_ZOOM = 10.5;

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

  return konfiguriert.replace(/\/+$/, "");
}

const LEGAL_BASE_URL = legaleBasisUrl();

export const LEGAL_URLS = {
  impressum: `${LEGAL_BASE_URL}/legal/impressum`,
  datenschutz: `${LEGAL_BASE_URL}/legal/datenschutz`,
  agb: `${LEGAL_BASE_URL}/legal/agb`,
} as const;
