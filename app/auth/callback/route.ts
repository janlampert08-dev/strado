import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils/url";
import {
  PASSWORT_AENDERN_PFAD,
  merkeWiederherstellung,
} from "@/lib/passwortWiederherstellung";

// Ziel sowohl des Bestätigungslinks einer Neuregistrierung als auch des
// Passwort-zurücksetzen-Links (aus der jeweils unveränderten Supabase-
// Standard-E-Mail) → Supabase verifiziert serverseitig und leitet hierher
// mit ?code=... weiter (PKCE-Flow). Welcher der beiden Fälle vorliegt,
// steuert einzig der jeweils mitgeschickte next-Pfad (siehe emailRedirectTo
// in lib/actions/auth.ts signUp() bzw. requestPasswordReset()) — die
// reguläre Anmeldung (signIn()) läuft nie über diese Route. Der next-Wert
// kommt aus einem öffentlich aufrufbaren Query-Parameter (nicht nur aus den
// beiden internen Aufrufern oben) und läuft deshalb durch safeInternalPath,
// damit ein präparierter ?next=https://evil.example keinen Open-Redirect
// auslösen kann. "/" ist als sicherer Default gewählt, der bestehende
// Nutzer nicht beeinflusst.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next")) ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Führt der Link auf die Passwort-Seite, ist das der
      // Zurücksetzen-Fall: die Person hat gerade nachgewiesen, dass sie an
      // das Postfach kommt, kennt ihr altes Passwort aber nicht. Nur dann
      // darf updatePassword() darauf verzichten, es abzufragen — siehe
      // lib/passwortWiederherstellung.ts für die vollständige Begründung.
      //
      // Der Vergleich ist bewusst exakt und gegen die Konstante, nicht
      // gegen einen Präfix: "/profil/passwort-aendern-doch-nicht" oder ein
      // angehängter Query-String sollen das Merkmal nicht auslösen.
      //
      // data.user stammt aus dem gerade abgeschlossenen Tokenaustausch mit
      // GoTrue, ist also serverseitig geprüft und nicht aus dem Request
      // übernommen.
      if (next === PASSWORT_AENDERN_PFAD && data.user) {
        await merkeWiederherstellung(data.user.id);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/anmelden?fehler=bestaetigung`);
}
