import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils/url";
import { FEHLER_BESTAETIGUNG, FEHLER_LINK } from "@/lib/authFehler";
import { OTP_RECOVERY, istErlaubterOtpTyp } from "@/lib/otpTyp";
import {
  PASSWORT_AENDERN_PFAD,
  merkeWiederherstellung,
} from "@/lib/passwortWiederherstellung";

// Ziel sowohl des Bestätigungslinks einer Neuregistrierung als auch des
// Passwort-zurücksetzen-Links. Die reguläre Anmeldung (signIn()) läuft nie
// über diese Route.
//
// ZWEI FORMEN, EIN HANDLER
//
// 1. ?token_hash=…&type=… — der von Supabase dokumentierte serverseitige
//    Weg. verifyOtp() prüft den Wert bei GoTrue; es braucht KEIN Cookie,
//    der Link lässt sich also auf jedem Gerät öffnen.
//
// 2. ?code=… — der PKCE-Weg. Supabase hängt den Code an, und der dazu
//    passende Prüfwert liegt als Cookie in genau dem Browser, aus dem die
//    Anfrage kam. Wer den Link woanders öffnet, kann ihn nicht einlösen.
//
// Form 2 war bis zum 2026-09-16 die einzige, und daran ist das Zurücksetzen
// gescheitert: gemessen am selben Tag — Anfrage um 15:49:55, ein Aufruf aus
// SamsungBrowser/Android um 15:49:56, der echte Klick um 15:50:18 aus
// Windows Chrome. Zwei Browser, also kein Prüfwert, also Fehlermeldung.
//
// Form 1 ist deshalb der neue Standard, Form 2 bleibt stehen: Links, die vor
// der Umstellung verschickt wurden, tragen weiterhin einen Code und sollen
// bis zu ihrem Ablauf funktionieren. Welche Form ankommt, entscheidet die
// E-Mail-Vorlage im Supabase-Dashboard, nicht dieser Code.
//
// Die Abwägung hinter Form 1 — der Link ist danach für sich genommen der
// Schlüssel — steht ausgeschrieben in lib/otpTyp.ts.
//
// Der next-Wert kommt aus einem öffentlich aufrufbaren Query-Parameter und
// läuft deshalb durch safeInternalPath, damit ein präparierter
// ?next=https://evil.example keinen Open-Redirect auslöst. "/" ist der
// sichere Default.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const typ = searchParams.get("type");
  const next = safeInternalPath(searchParams.get("next")) ?? "/";

  // Der Typ steuert unten das Wiederherstellungs-Merkmal und geht an
  // verifyOtp(). Er kommt aus der Adresszeile, deshalb die Allow-List:
  // erlaubt ist nur, was unsere eigenen E-Mails erzeugen (lib/otpTyp.ts).
  if (tokenHash && istErlaubterOtpTyp(typ)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: typ,
      token_hash: tokenHash,
    });
    if (!error) {
      // Hier entscheidet der TYP, nicht der Pfad — das ist genauer als beim
      // Code-Weg unten: "recovery" sagt unmittelbar, dass dieser Link aus
      // einer Zurücksetzen-E-Mail stammt, während der Pfad nur mitgeschickt
      // wird. Die Begründung, wozu das Merkmal berechtigt, steht in
      // lib/passwortWiederherstellung.ts.
      //
      // data.user stammt aus der gerade abgeschlossenen Prüfung bei GoTrue,
      // ist also serverseitig verifiziert und nicht aus dem Request
      // übernommen.
      if (typ === OTP_RECOVERY && data.user) {
        await merkeWiederherstellung(data.user.id);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

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

  // Einlösen gescheitert (Link abgelaufen, schon verwendet, oder in einem
  // anderen Browser geöffnet als dem, aus dem er angefordert wurde — der
  // PKCE-Prüfwert liegt als Cookie genau dort). Wohin es dann geht, hängt
  // davon ab, was der Link vorhatte: beim Zurücksetzen ist die Anmeldung die
  // eine Seite, die nicht weiterhilft, denn das Passwort ist ja unbekannt.
  //
  // Der Parameter war bis hierher wirkungslos — gesetzt, aber von keiner
  // Seite gelesen. Wer auf einem toten Link landete, bekam ein
  // kommentarloses Anmeldeformular. Die Meldungen stehen in
  // lib/authFehler.ts.
  // Beim Zurücksetzen ist die Anmeldung die eine Seite, die nicht
  // weiterhilft — das Passwort ist ja unbekannt. Der Typ zählt hier
  // gleichberechtigt zum Pfad: ein token_hash-Link trägt "recovery", auch
  // wenn sein next-Wert einmal fehlen sollte.
  const zumZuruecksetzen = typ === OTP_RECOVERY || next === PASSWORT_AENDERN_PFAD;
  const fehlerZiel = zumZuruecksetzen
    ? `/anmelden/passwort-vergessen?fehler=${FEHLER_LINK}`
    : `/anmelden?fehler=${FEHLER_BESTAETIGUNG}`;

  return NextResponse.redirect(`${origin}${fehlerZiel}`);
}
