import { NextResponse } from "next/server";
import { getRouteLeaderboard, getRouteLeaderboardKlassen } from "@/lib/leaderboard";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";
import { istKlassenfilter } from "@/lib/motorklassen";

// Liefert die (freiwillig geteilten) Bestzeiten einer Strecke — genutzt vom
// Strecken-Chooser auf /leaderboards und von der Bestzeiten-Karte auf der
// Streckenseite, damit ein Klassenwechsel dort nicht eine volle
// Serverkomponenten-Neuberechnung der ganzen Seite auslöst.
//
// Antwortform:
//   entries — die Bestzeiten, gefiltert wenn ?klasse= gesetzt ist
//   klassen — die Motorklassen, in denen es auf DIESER Strecke überhaupt
//             geteilte Zeiten gibt; speist die Chip-Leiste
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isRateLimitedByKey(`api:strecken:leaderboard:${getClientIp(request.headers)}`, 60, 60_000)) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ entries: [], klassen: [] });
  }

  // Strikte Allowlist gegen den Katalog, kein Durchreichen in die Abfrage:
  // istKlassenfilter() kennt genau die zwei Fahrzeugtypen und die sechs
  // Klassenschlüssel aus lib/motorklassen.ts (und aus public.motorklasse(),
  // 0080), alles andere fällt raus. Ein unbekannter Wert wird wie eine
  // unbekannte Strecken-ID oben behandelt — leere Antwort statt Fehler,
  // damit ein Scan hier nichts über den Bestand erfährt.
  //
  // Beide Stufen der Auswahl teilen sich denselben Parameter, weil sie sich
  // gegenseitig ausschliessen: ein Paar aus ?typ= und ?klasse= liesse den
  // widersprüchlichen Zustand "typ=motorrad&klasse=auto_bis110" überhaupt
  // erst entstehen. Siehe Klassenfilter in lib/motorklassen.ts.
  const roh = new URL(request.url).searchParams.get("klasse");
  if (roh !== null && !istKlassenfilter(roh)) {
    return NextResponse.json({ entries: [], klassen: [] });
  }
  const filter = roh === null ? null : roh;

  const [entries, klassen] = await Promise.all([
    getRouteLeaderboard(id, filter),
    getRouteLeaderboardKlassen(id),
  ]);

  return NextResponse.json(
    { entries, klassen },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" } },
  );
}
