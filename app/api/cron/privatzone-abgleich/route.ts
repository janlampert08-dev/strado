import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { privatzonenGeheimnis } from "@/lib/privatzone";
import { recomputePublicTracks } from "@/lib/publicTrack";

// Täglicher Abgleich der öffentlichen Tracks mit der verschleierten
// Privatzone (lib/privatzone.ts, seit 2026-09-25).
//
// Warum es das braucht: neue und umgeschaltete Fahrten werden beim Speichern
// verschleiert gekappt, bereits geteilte aber nur, wenn ihr Besitzer die
// Einstellungen erneut speichert (recomputePublicTracks, aufgerufen aus
// lib/actions/profile.ts). Beim Umstieg lagen 11 öffentliche Tracks von
// 2 Konten noch in der alten, exakt um den Start gekappten Form vor — genau
// die, aus der sich die Haustür nachrechnen lässt (Re-Audit 2026-09-25, M1).
// Die Kappung braucht das Servergeheimnis und ist JS-Rechnung, deshalb kein
// SQL-Nachzug, sondern dieser Lauf.
//
// Idempotent: die Verschleierung ist deterministisch (HMAC über Konto und
// Rasterzelle), ein erneuter Lauf schreibt denselben Track. Damit darf der
// Job täglich laufen und fängt auch jede künftige Lücke — etwa einen
// Radiuswechsel, dessen Neuberechnung in der Server Action abgebrochen ist.
//
// Ohne Geheimnis bricht er ab, statt Tracks zu leeren: oeffentlicheKoordinaten
// gäbe dann für jede Fahrt eine leere Linie zurück.

function istBerechtigt(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!istBerechtigt(req)) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 401 });
  }
  if (!privatzonenGeheimnis()) {
    console.error("Privatzonen-Abgleich: kein Servergeheimnis, nichts geändert");
    return NextResponse.json({ error: "Kein Geheimnis" }, { status: 500 });
  }

  const admin = createAdminClient();

  // Nur Konten mit mindestens einer öffentlichen Fahrt. Der Service-Role-
  // Client liest privatzone_radius_m weiterhin (0132 entzieht das Recht nur
  // anon/authenticated).
  const { data: fahrten, error } = await admin
    .from("route_completions")
    .select("user_id")
    .eq("ist_oeffentlich", true)
    .not("track_oeffentlich", "is", null)
    .returns<{ user_id: string }[]>();
  if (error) {
    console.error("Privatzonen-Abgleich: Fahrten nicht lesbar", error.message);
    return NextResponse.json({ error: "Abgleich fehlgeschlagen" }, { status: 500 });
  }

  const konten = [...new Set((fahrten ?? []).map((f) => f.user_id))];
  if (konten.length === 0) return NextResponse.json({ konten: 0, fehlgeschlagen: 0 });

  const { data: profile, error: profilFehler } = await admin
    .from("profiles")
    .select("id, privatzone_radius_m")
    .in("id", konten)
    .returns<{ id: string; privatzone_radius_m: number | null }[]>();
  if (profilFehler) {
    console.error("Privatzonen-Abgleich: Profile nicht lesbar", profilFehler.message);
    return NextResponse.json({ error: "Abgleich fehlgeschlagen" }, { status: 500 });
  }

  let fehlgeschlagen = 0;
  for (const profil of profile ?? []) {
    // Ein fehlender Wert gilt wie überall als strengste Stufe
    // (privacyRadiusM in lib/publicTrack.ts).
    const radius = profil.privatzone_radius_m ?? 500;
    const ok = await recomputePublicTracks(admin, profil.id, radius);
    if (!ok) fehlgeschlagen += 1;
  }

  if (fehlgeschlagen > 0) {
    console.error("Privatzonen-Abgleich: Konten mit Fehlern", { fehlgeschlagen });
  }
  return NextResponse.json({ konten: konten.length, fehlgeschlagen });
}
