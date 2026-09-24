import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils/url";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { FEHLER_BESTAETIGUNG, FEHLER_LINK, FEHLER_ZU_VIELE } from "@/lib/authFehler";
import { OTP_RECOVERY, istErlaubterOtpTyp } from "@/lib/otpTyp";
import {
  PASSWORT_AENDERN_PFAD,
  codeAustauschIstWiederherstellung,
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

  // WARUM HIER EINE BREMSE STEHT
  //
  // Diese Route nimmt einen Einloesewert aus der Adresszeile entgegen, gibt
  // ihn an verifyOtp() und legt bei Erfolg eine Sitzung an — bei
  // type=recovery zusaetzlich das Wiederherstellungs-Merkmal, das dem
  // Passwortwechsel die Abfrage des aktuellen Passworts erspart
  // (lib/passwortWiederherstellung.ts). Sie ist unauthentifiziert, und
  // proxy.ts nimmt /auth/ von seinem einzigen Gate aus.
  //
  // Bis hierher war sie damit die EINZIGE Einloesestelle ohne Begrenzung:
  // signIn, signUp, bestaetigeRegistrierung, sendeBestaetigungErneut und
  // requestPasswordReset zaehlen alle mit (lib/actions/auth.ts), nur dieser
  // Weg nicht. Wie viel das wert ist, haengt daran, wie viel Entropie im
  // token_hash steckt — und genau das entscheidet GoTrue, nicht dieser
  // Code. Eine Bremse, die nur bei kurzen Werten noetig ist, gehoert
  // trotzdem hierhin: sie kostet nichts, wenn der Wert lang ist.
  //
  // Pro IP und nicht pro token_hash: beim Durchprobieren ist jeder Versuch
  // ein ANDERER Hash, ein Zaehler je Wert sieht davon also nichts. Das
  // Budget ist bewusst weit — ein echter Klick kommt einmal, ein zweiter
  // nach einem neu angeforderten Link — und liegt auf der Hoehe von
  // signin:ip (20).
  //
  // Was diese Bremse NICHT ist: global. isRateLimitedByKey haelt seinen
  // Zaehler je Serverless-Instanz (lib/rateLimit.ts), ein verteilter
  // Angreifer bekommt also das Budget mal Anzahl warmer Instanzen. Sie hebt
  // die Latte, sie schliesst die Tuer nicht.
  //
  // Die Parameter werden vor der Bremse gelesen, damit ihr Treffer auf
  // derselben Seite landet wie ein toter Link: ein leerer 429 ist beim
  // Zurücksetzen der schlechtestmögliche Ausgang — die Person kennt ihr
  // Passwort nicht, und ein weisses Fenster sagt ihr nichts. Das Lesen
  // kostet nichts (nur searchParams), es findet weiterhin keine Einlösung
  // statt, bevor die Bremse entschieden hat.
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const typ = searchParams.get("type");
  const next = safeInternalPath(searchParams.get("next")) ?? "/";
  const zumZuruecksetzen = typ === OTP_RECOVERY || next === PASSWORT_AENDERN_PFAD;

  if (isRateLimitedByKey(`authcallback:ip:${getClientIp(request.headers)}`, 20, 10 * 60_000)) {
    const ziel = zumZuruecksetzen
      ? `/anmelden/passwort-vergessen?fehler=${FEHLER_ZU_VIELE}`
      : `/anmelden?fehler=${FEHLER_ZU_VIELE}`;
    const antwort = NextResponse.redirect(`${origin}${ziel}`);
    // Für Maschinen die eigentliche Auskunft; der Mensch bekommt die
    // Meldung aus lib/authFehler.ts auf der Zielseite.
    antwort.headers.set("Retry-After", "600");
    return antwort;
  }

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
      //
      // Der Pfad allein reicht dafür NICHT mehr: auch eine Google-Anmeldung
      // oder eine Registrierungsbestätigung kann ihn als next mitbringen.
      // Ob wirklich eine Zurücksetzen-E-Mail dahinter steht, entscheidet
      // codeAustauschIstWiederherstellung() aus GoTrues eigener Antwort.
      if (
        next === PASSWORT_AENDERN_PFAD &&
        data.user &&
        codeAustauschIstWiederherstellung({
          accessToken: data.session?.access_token,
          recoverySentAt: data.user.recovery_sent_at,
        })
      ) {
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
  // Oben schon berechnet, damit die Bremse dasselbe Ziel trifft.
  const fehlerZiel = zumZuruecksetzen
    ? `/anmelden/passwort-vergessen?fehler=${FEHLER_LINK}`
    : `/anmelden?fehler=${FEHLER_BESTAETIGUNG}`;

  return NextResponse.redirect(`${origin}${fehlerZiel}`);
}
