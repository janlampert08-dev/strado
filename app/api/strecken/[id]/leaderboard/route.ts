import { NextResponse } from "next/server";
import { getRouteLeaderboard, getRouteLeaderboardKlassen } from "@/lib/leaderboard";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";
import { istMotorklasse } from "@/lib/motorklassen";

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

  // Strikte Allowlist gegen den Klassenkatalog, kein Durchreichen in die
  // Abfrage: istMotorklasse() kennt genau die sechs Schlüssel aus
  // lib/motorklassen.ts (und aus public.motorklasse(), 0080), alles andere
  // fällt raus. Ein unbekannter Wert wird wie eine unbekannte Strecken-ID
  // oben behandelt — leere Antwort statt Fehler, damit ein Scan hier nichts
  // über den Bestand erfährt.
  const roh = new URL(request.url).searchParams.get("klasse");
  if (roh !== null && !istMotorklasse(roh)) {
    return NextResponse.json({ entries: [], klassen: [] });
  }
  const klasse = roh === null ? null : roh;

  const [entries, klassen] = await Promise.all([
    getRouteLeaderboard(id, klasse),
    getRouteLeaderboardKlassen(id),
  ]);

  return NextResponse.json({ entries, klassen });
}
