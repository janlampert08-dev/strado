import { after, NextResponse, type NextRequest } from "next/server";
import { creatorKlickZaehlen, creatorLinkAufloesen, einstiegsPfad } from "@/lib/creatorLinks";
import {
  HERKUNFT_COOKIE,
  HERKUNFT_COOKIE_OPTIONEN,
  herkunftCookieWert,
} from "@/lib/herkunft";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";

// /c/<code> — die Adresse, die ein Creator verteilt (siehe
// docs/creator-links-plan.md). Sie leitet in die App weiter und hängt dabei
// die UTM-Parameter an, die Vercel Web Analytics auswertet; die Zuordnung
// steht also in der Datenbank und nicht in zwanzig von Hand getippten Links.
//
// Ein Route Handler und keine Seite mit ?c=: eine Seite könnte das Cookie
// unten nicht setzen — das geht in Next.js nur in einer Server Action oder
// eben hier. Und nicht in proxy.ts: die Middleware läuft laut ihrem Matcher
// auf nahezu jeder Anfrage und ist Protected Area; für ein paar Klicks pro
// Tag gehört dort nichts hinein.
//
// NextRequest statt Request, seit hier ein Cookie gelesen wird: request.cookies
// erspart das Zerlegen des Cookie-Headers von Hand.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { searchParams, origin } = new URL(request.url);

  // Unauthentifizierter Endpunkt, der seit Migration 0084 pro Aufruf eine
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
  // Dieser Handler setzt unten ein Cookie — bei 308 liefe er beim zweiten
  // Klick derselben Person gar nicht mehr, und genau die zweite Sitzung
  // ist die, in der sich jemand registriert. no-store aus demselben
  // Grund, und weil ein deaktivierter Code sonst weiter weiterleitete.
  const antwort = NextResponse.redirect(new URL(ziel, origin), 307);
  antwort.headers.set("Cache-Control", "no-store");

  // Die Herkunft über den Klick hinaus festhalten. Ohne das wäre die
  // Zuordnung auf die Sitzung beschränkt, in der geklickt wurde — und
  // registriert wird typischerweise später, gekauft noch viel später.
  //
  // Nur bei einem aufgelösten Code: ein Tippfehler oder ein deaktivierter
  // Link soll keine Zuordnung erfinden. Und nur, wenn noch keine
  // dasteht — First Touch gewinnt, siehe herkunftCookieWert().
  if (link) {
    const wert = herkunftCookieWert(request.cookies.get(HERKUNFT_COOKIE)?.value, link.code);
    if (wert) antwort.cookies.set(HERKUNFT_COOKIE, wert, HERKUNFT_COOKIE_OPTIONEN);

    // Den Klick zählen — der Nenner des Trichters, den /creator zeigt
    // (Migration 0091).
    //
    // In after() und nicht davor: der Zähler ist ein Nebeneffekt, und hier
    // steht ein Mensch im Browser, der auf einen Link in einer Caption
    // getippt hat. Die Weiterleitung soll nicht auf einen
    // Datenbank-Roundtrip warten, der für ihn nichts tut. after() läuft,
    // nachdem die Antwort raus ist, und darf laut Next.js in einem Route
    // Handler weiterhin cookies() lesen — was createClient() braucht.
    after(() => creatorKlickZaehlen(link.code));
  }

  return antwort;
}
