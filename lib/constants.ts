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
// liegen im Repo janlampert08-dev/cornice.ch unter legal/.
//
// Die Basis ist überschreibbar, weil die Zieldomain und die heute erreichbare
// Adresse noch auseinanderfallen: cornice.ch ist bei Vercel als Custom Domain
// noch nicht eingetragen, die Seiten stehen bis dahin unter
// cornice-ch.vercel.app. Bis die Domain hängt, gehört diese Adresse in
// NEXT_PUBLIC_LEGAL_BASE_URL — sonst zeigen Anmelden, Registrieren und die
// Einstellungen auf eine Domain, die noch nicht antwortet.
//
// Der frühere Wert war https://xyz.ch/… — eine erfundene Domain, die nicht
// uns gehört. Das ist schlimmer als ein toter Link: sie könnte jederzeit
// jemand anderem gehören und beliebige Inhalte ausliefern, während bei uns
// „Impressum" darüber steht.
const LEGAL_BASE_URL = (
  process.env.NEXT_PUBLIC_LEGAL_BASE_URL ?? "https://cornice.ch"
).replace(/\/+$/, "");

export const LEGAL_URLS = {
  impressum: `${LEGAL_BASE_URL}/legal/impressum`,
  datenschutz: `${LEGAL_BASE_URL}/legal/datenschutz`,
  agb: `${LEGAL_BASE_URL}/legal/agb`,
} as const;
