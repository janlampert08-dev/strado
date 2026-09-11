import { NextResponse } from "next/server";
import { creatorLinkAufloesen, einstiegsPfad } from "@/lib/creatorLinks";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";

// /c/<code> — die Adresse, die ein Creator verteilt (siehe
// docs/creator-links-plan.md). Sie leitet in die App weiter und hängt dabei
// die UTM-Parameter an, die Vercel Web Analytics auswertet; die Zuordnung
// steht also in der Datenbank und nicht in zwanzig von Hand getippten Links.
//
// Ein Route Handler und keine Seite mit ?c=: eine Seite könnte in Phase 2
// kein Cookie setzen — das geht in Next.js nur in einer Server Action oder
// eben hier. Und nicht in proxy.ts: die Middleware läuft laut ihrem Matcher
// auf nahezu jeder Anfrage und ist Protected Area; für ein paar Klicks pro
// Tag gehört dort nichts hinein.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { searchParams, origin } = new URL(request.url);

  // Unauthentifizierter Endpunkt, der seit Migration 0080 pro Aufruf eine
  // Datenbankfunktion aufruft — dieselbe Ausgangslage wie bei
  // app/api/strecken/**, also dieselbe Bremse (lib/rateLimit.ts).
  //
  // Anders als dort aber keine 429: hier steht ein Mensch im Browser, der
  // auf einen Link in einer TikTok-Bio getippt hat. Der landet in der App,
  // nur ohne Zuordnung — der Fehlerfall kostet eine Zählung, keine Sitzung.
  // Die Prüfung steht vor dem Datenbankaufruf, sonst bremste sie nichts.
  const gebremst = isRateLimitedByKey(`creator:einstieg:${getClientIp(request.headers)}`, 60, 60_000);

  const { code } = await params;
  const link = gebremst ? null : await creatorLinkAufloesen(code);

  // Unbekannter, deaktivierter oder gebremster Code: still auf die
  // Startseite, ohne UTM. Bewusst keine 404 — hinter einem toten Link steht
  // ein echter Besucher, der in die App wollte, und der hat keine
  // Fehlerseite verdient. Ohne UTM, weil sonst jeder Tippfehler Aufrufe
  // unter einem Code sammelte, den nie jemand vergeben hat.
  const ziel = link ? einstiegsPfad(link, searchParams.get("z")) : "/";

  // 307 statt 308: ein permanenter Redirect bleibt im Browser hängen.
  // Spätestens wenn dieser Handler in Phase 2 ein Cookie setzt, liefe er
  // beim zweiten Klick derselben Person gar nicht mehr — und genau die
  // zweite Sitzung ist die, in der sich jemand registriert. no-store aus
  // demselben Grund, und weil ein deaktivierter Code sonst weiter
  // weiterleitete.
  const antwort = NextResponse.redirect(new URL(ziel, origin), 307);
  antwort.headers.set("Cache-Control", "no-store");
  return antwort;
}
