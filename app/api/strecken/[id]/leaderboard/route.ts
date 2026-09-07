import { NextResponse } from "next/server";
import { getRouteLeaderboard } from "@/lib/leaderboard";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { isValidUuid } from "@/lib/validation";

// Liefert die (freiwillig geteilten) Bestzeiten einer Strecke — genutzt vom
// Strecken-Chooser auf /leaderboards, damit dieser nicht bei jedem Wechsel
// eine volle Serverkomponenten-Neuberechnung der ganzen Seite auslösen muss.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isRateLimitedByKey(`api:strecken:leaderboard:${getClientIp(request.headers)}`, 60, 60_000)) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ entries: [] });
  }

  const entries = await getRouteLeaderboard(id);
  return NextResponse.json({ entries });
}
