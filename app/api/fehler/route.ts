import { NextResponse } from "next/server";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";

// Nimmt sparsame Client-Fehlerberichte entgegen (lib/fehlerbericht.ts).
// Schreibt nichts in die Datenbank — nur Server-Log für Vercel
// Runtime-Logs. IP-begrenzt, validierte Form, keine Nutzerinhalte.
export async function POST(request: Request) {
  if (isRateLimitedByKey(`api:fehler:${getClientIp(request.headers)}`, 10, 60_000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { pfad, meldung, stapel, kontext } = body as Record<string, unknown>;
  if (typeof meldung !== "string" || meldung.length === 0 || meldung.length > 300) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (pfad !== undefined && (typeof pfad !== "string" || pfad.length > 200)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  console.error("[client-fehler]", {
    pfad: typeof pfad === "string" ? pfad : null,
    meldung,
    stapel: typeof stapel === "string" ? stapel.slice(0, 1000) : null,
    kontext: typeof kontext === "string" ? kontext.slice(0, 200) : null,
  });
  return NextResponse.json({ ok: true });
}
