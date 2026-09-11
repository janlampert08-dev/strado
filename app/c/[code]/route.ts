import { NextResponse } from "next/server";
import { einstiegsPfad, findeCreatorLink } from "@/lib/creatorLinks";

// /c/<code> — die Adresse, die ein Creator verteilt (Phase 1 aus
// docs/creator-links-plan.md). Sie leitet in die App weiter und hängt dabei
// die UTM-Parameter an, die Vercel Web Analytics auswertet; die Zuordnung
// steht also in lib/creatorLinks.ts und nicht in zwanzig von Hand getippten
// Links.
//
// Ein Route Handler und keine Seite mit ?c=: eine Seite könnte in Phase 2
// kein Cookie setzen — das geht in Next.js nur in einer Server Action oder
// eben hier. Und nicht in proxy.ts: die Middleware läuft laut ihrem Matcher
// auf nahezu jeder Anfrage und ist Protected Area; für ein paar Klicks pro
// Tag gehört dort nichts hinein.
//
// Kein Rate Limit, anders als bei /api/strecken/**: dieser Handler liest
// keine Datenbank, schreibt nichts und ruft nichts Fremdes auf — er schlägt
// einen Wert in einer Konstanten nach und antwortet mit einer
// Weiterleitung. Sobald Phase 2 hier ein Cookie setzt oder eine Zeile
// schreibt, ist diese Begründung hinfällig.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { searchParams, origin } = new URL(request.url);

  const link = findeCreatorLink(code);

  // Unbekannter Code: still auf die Startseite, ohne UTM. Bewusst keine
  // 404 — hinter einem toten Link steht ein echter Besucher, der in die App
  // wollte, und der hat keine Fehlerseite verdient. Ohne UTM, weil sonst
  // jeder Tippfehler Aufrufe unter einem Code sammelte, den nie jemand
  // vergeben hat.
  const ziel = link ? einstiegsPfad(link, searchParams.get("z")) : "/";

  // 307 statt 308: ein permanenter Redirect bleibt im Browser hängen.
  // Spätestens wenn dieser Handler in Phase 2 ein Cookie setzt, liefe er
  // beim zweiten Klick derselben Person gar nicht mehr — und genau die
  // zweite Sitzung ist die, in der sich jemand registriert.
  const antwort = NextResponse.redirect(new URL(ziel, origin), 307);
  antwort.headers.set("Cache-Control", "no-store");
  return antwort;
}
