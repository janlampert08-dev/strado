import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Prüft, dass der POST von der eigenen Origin kommt. Route Handlers haben —
// anders als Server Actions — keinen eingebauten Origin-Check, dieser
// Handler hat kein CSRF-Token, und eine fremde Seite kann ein
// Auto-Submit-Formular auf beliebige URLs abschicken. Der Schaden ist
// begrenzt (kein Datenzugriff), aber eine erzwungene Abmeldung reisst eine
// laufende Fahrtaufzeichnung aus dem angemeldeten Zustand — der Snapshot
// liegt dann unter der Gast-ID statt unter der des Nutzers.
//
// Sec-Fetch-Site ist der genauere Wert (vom Browser gesetzt, für die Seite
// nicht fälschbar); Origin ist der Fallback für Clients, die es nicht
// senden. Fehlen beide, wird abgelehnt: ein Abmelde-POST entsteht immer aus
// einem Formular einer geladenen Seite und trägt daher mindestens eines von
// beiden.
function istGleicheOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    // Unparsbarer Origin-Header — im Zweifel ablehnen.
    return false;
  }
}

export async function POST(request: Request) {
  if (!istGleicheOrigin(request)) {
    return new NextResponse("Abmeldung nur von dieser Seite aus möglich.", {
      status: 403,
    });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}
