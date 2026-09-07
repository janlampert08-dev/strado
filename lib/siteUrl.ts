// Basis-URL der Anwendung für Links, die ausserhalb eines Request-Kontexts
// gebaut werden. Einziger Aufrufer ist heute die Rückkehr-Adresse aus Stripes
// Kundenportal (lib/actions/billing.ts) — eine absolute URL ist dort Pflicht,
// Stripe weist eine relative zurück.
//
// Bewusst hier statt in lib/actions/billing.ts: eine Datei mit der
// "use server"-Direktive darf laut Next.js/React nur async Functions
// exportieren, eine synchrone Hilfsfunktion liesse sich dort weder exportieren
// noch testen. Dieselbe Aufteilung wie bei lib/stripeWebhook.ts.
//
// Die Reihenfolge ist Absicht:
//
// 1. NEXT_PUBLIC_SITE_URL — die ausdrückliche Konfiguration gewinnt immer.
// 2. VERCEL_PROJECT_PRODUCTION_URL — von Vercel automatisch gesetzt und die
//    stabile Produktions-Domain (dieselbe Quelle wie metadataBase in
//    app/layout.tsx). Sie ist der Grund, warum eine vergessene Variable in
//    Production nicht mehr auf localhost zeigt: bewusst NICHT VERCEL_URL,
//    denn die wechselt mit jedem Deployment, und aus einer Vorschau soll die
//    Rückkehr aus dem Kundenportal auf der echten Domain landen.
// 3. http://localhost:3000 — nur noch der Entwicklungsfall.
//
// Vorher stand hier ein blosses `?? "http://localhost:3000"`. Das hatte zwei
// Fehler, die beide erst beim zahlenden Kunden sichtbar geworden wären: ohne
// gesetzte Variable schickte das Kundenportal ihn auf seinen eigenen Rechner,
// und ?? behält einen leeren String. .env.local.example führt die Variable
// ohne Wert; eine daraus kopierte Datei liefert "" und daraus wurde
// "/profil" — eine relative URL, die Stripe zurückweist.
const ENTWICKLUNGS_STANDARD = "http://localhost:3000";

// Nimmt einen Kandidaten an, wenn er eine gültige http(s)-URL ist, und
// entfernt abschliessende Schrägstriche (sonst entstünde "…//profil").
function geprueft(kandidat: string | undefined): string | null {
  const wert = kandidat?.trim();
  if (!wert) return null;

  let url: URL;
  try {
    url = new URL(wert);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  return wert.replace(/\/+$/, "");
}

export function siteUrl(): string {
  const konfiguriert = geprueft(process.env.NEXT_PUBLIC_SITE_URL);
  if (konfiguriert) return konfiguriert;

  // Vercel liefert den Hostnamen ohne Schema.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const vonVercel = vercel ? geprueft(`https://${vercel}`) : null;
  if (vonVercel) return vonVercel;

  return ENTWICKLUNGS_STANDARD;
}
