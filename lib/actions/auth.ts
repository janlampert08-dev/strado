"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin, safeInternalPath } from "@/lib/utils/url";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { leseHerkunft, verbraucheHerkunft } from "@/lib/herkunft";
import { getStripe } from "@/lib/stripe";
import { AVATAR_BUCKET, avatareEntfernen } from "@/lib/avatarSpeicher";
import { warteAufPruefwert } from "@/lib/pruefwertCookie";
import {
  PASSWORT_AENDERN_PFAD,
  istWiederherstellung,
  verbraucheWiederherstellung,
} from "@/lib/passwortWiederherstellung";
import { OTP_SIGNUP } from "@/lib/otpTyp";
import { EINRICHTUNG_PFAD } from "@/lib/einrichtung";
import {
  BESTAETIGUNG_PFAD,
  CODE_LAENGE,
  codeNormalisieren,
  leseBestaetigung,
  merkeBestaetigung,
  verbraucheBestaetigung,
} from "@/lib/bestaetigung";

export interface AuthFormState {
  error: string | null;
}

// Grenzen gegen übergrosse/unsinnige Eingaben, bevor sie überhaupt an
// Supabase Auth gehen — kein hartes Sicherheitsmerkmal (Supabase validiert
// selbst), aber verhindert unnötig grosse Requests/Payloads.
const MAX_EMAIL_LENGTH = 255;
const MAX_PASSWORD_LENGTH = 200;

const TOO_MANY_ATTEMPTS_ERROR =
  "Zu viele Versuche. Bitte warte ein paar Minuten und versuche es erneut.";

async function currentIp(): Promise<string> {
  return getClientIp(await headers());
}

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").slice(0, MAX_EMAIL_LENGTH);
  const password = String(formData.get("password") ?? "").slice(
    0,
    MAX_PASSWORD_LENGTH,
  );

  if (!email || !password) {
    return { error: "E-Mail oder Passwort ist falsch." };
  }

  // Zwei Limits: eines pro IP (bremst verteiltes Durchprobieren vieler
  // Adressen von derselben Quelle) und eines pro Adresse unabhängig von der
  // IP (bremst gezieltes Erraten eines einzelnen Passworts über wechselnde
  // IPs). Beide sind bewusst grosszügig, um normale Tippfehler nicht zu
  // blockieren.
  const ip = await currentIp();
  if (
    isRateLimitedByKey(`signin:ip:${ip}`, 20, 5 * 60_000) ||
    isRateLimitedByKey(`signin:email:${email.toLowerCase()}`, 5, 5 * 60_000)
  ) {
    return { error: TOO_MANY_ATTEMPTS_ERROR };
  }

  // Vor dem Anmeldeversuch gelesen, weil beide Ausgänge unten den Wert
  // brauchen: der Erfolg als Rücksprungziel, die unbestätigte Adresse als
  // Ziel NACH der Bestätigung.
  const next = safeInternalPath(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Richtiges Passwort, fehlende Bestätigung. GoTrue prüft in dieser
    // Reihenfolge — email_not_confirmed kommt erst nach erfolgreicher
    // Passwortprüfung, ein falsches Passwort führt vorher zu
    // invalid_grant. Wer hier landet, kommt also nachweislich an das Konto
    // und hat bloss den Code aus der Registrierungsmail nie eingegeben.
    //
    // Bisher stand hier eine Meldung, die auf „den Link in der E-Mail"
    // verwies — und liess die Person damit allein: der Link ist unter
    // Umständen Wochen alt, und ein Formular, in dem sie einen neuen Code
    // anfordern könnte, gab es nicht. Jetzt geht es direkt dorthin. Das
    // Cookie trägt die Adresse, ohne die verifyOtp nichts anfangen kann
    // (lib/bestaetigung.ts).
    //
    // Ausdrücklich OHNE neuen Versand von hier aus: sonst löste jeder
    // Anmeldeversuch eine E-Mail aus, auch der versehentliche. Den Knopf
    // dafür hat die Seite.
    //
    // Über die Kontoexistenz verrät das nichts, was die vorherige Fassung
    // nicht auch verraten hat: dieselbe Unterscheidung, nur ein anderer
    // Ausgang.
    if (error.code === "email_not_confirmed") {
      await merkeBestaetigung(email, next);
      redirect(BESTAETIGUNG_PFAD);
    }
    return { error: "E-Mail oder Passwort ist falsch." };
  }

  // Optionales verstecktes Feld "next" (siehe AnmeldenForm.tsx) bringt
  // Nutzer nach der Anmeldung dorthin, wofür sie sich angemeldet haben —
  // etwa /fahrten/neu nach einem Klick auf "Fahrt starten". Der Wert ist
  // vollständig client-kontrolliert und läuft deshalb weiter oben durch
  // safeInternalPath: ohne diese Prüfung liesse sich die Anmeldung als
  // Open-Redirect auf eine fremde Domain missbrauchen (Phishing-Seite, die
  // nach einer echten Anmeldung erscheint). Ohne/ungültiges Feld bleibt
  // /profil das unveränderte Standardziel.
  redirect(next ?? "/profil");
}

// Anmeldung über Google (OAuth 2.0 via Supabase, PKCE). Ein Tap statt
// E-Mail + Passwort + Code — der kürzeste Weg vom Besucher zum Konto.
//
// Ablauf: diese Action baut die Google-URL (skipBrowserRedirect, der
// PKCE-Prüfwert landet dabei als Cookie) und schickt den Browser per
// redirect() dorthin. Google antwortet auf /auth/callback?code=…,
// app/auth/callback/route.ts löst per exchangeCodeForSession ein —
// derselbe geprüfte Pfad wie jeder andere Login.
//
// Was OAuth NICHT mitbringt (dokumentierte Lücke, kein Versehen):
// signUp() legt display_name, herkunft_code und promo_code in
// raw_user_meta_data — handle_new_user() (0088/0121) liest genau die.
// signInWithOAuth kennt keine Metadaten, also entsteht das Profil mit
// leerem Namen (nullable seit 0001, kein Bruch) und ohne Herkunft und
// Promo. Heisst: Creator-Attribution und 7-Tage-Link gelten vorerst nur
// für die E-Mail-Registrierung. Schliessen braucht eine Nachtrag-Funktion
// in der DB — eigene Mini-Migration, bewusst nicht in diesem Batch.
// Den Namen setzt man im Profil nach (0109).
//
// redirectTo muss zusätzlich im Supabase-Dashboard unter den Redirect-URLs
// stehen (app + staging), sonst antwortet GoTrue mit "redirect not
// allowed" — der Fehler unten fängt genau das lesbar ab.
export async function signInMitGoogle(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  // Gegen Skripte, die Anläufe im Sekundentakt erzeugen — die eigentliche
  // Prüfung (Passwort/Code) gibt es hier nicht, dafür aber teure
  // Redirect-Runden über GoTrue und Google.
  if (isRateLimitedByKey(`oauth:ip:${await currentIp()}`, 20, 10 * 60_000)) {
    return { error: TOO_MANY_ATTEMPTS_ERROR };
  }

  const next = safeInternalPath(formData.get("next"));
  const origin = await getOrigin();
  const emailRedirectTo = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: emailRedirectTo,
      skipBrowserRedirect: true,
    },
  });

  // Kein Redirect ins Leere: Provider im Dashboard nicht aktiviert,
  // Redirect-URL nicht erlaubt, GoTrue unerreichbar — alles landet hier
  // statt auf einer weissen Google-Fehlerseite.
  if (error || !data.url) {
    console.error("Google-Anmeldung konnte nicht gestartet werden", error);
    return {
      error: "Google-Anmeldung ist gerade nicht verfügbar. Bitte mit E-Mail fortfahren.",
    };
  }

  redirect(data.url);
}

// PostgREST reicht ilike als SQL LIKE durch — % und _ (und \ selbst) haben
// dort Sonderbedeutung als Wildcards und müssen escaped werden, sonst würde
// z.B. der Name "50%" jeden zweistelligen Namen fälschlich als vergeben melden.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function signUp(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").slice(0, MAX_EMAIL_LENGTH);
  const password = String(formData.get("password") ?? "").slice(
    0,
    MAX_PASSWORD_LENGTH,
  );
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
  }
  if (displayName.length < 2) {
    return { error: "Benutzername muss mindestens 2 Zeichen lang sein." };
  }
  if (displayName.length > 50) {
    return { error: "Benutzername darf höchstens 50 Zeichen lang sein." };
  }

  // Begrenzt Massen-Registrierung von derselben Quelle (Skripte, die viele
  // Konten anlegen) statt echter, gelegentlicher Neuanmeldungen.
  if (isRateLimitedByKey(`signup:ip:${await currentIp()}`, 5, 10 * 60_000)) {
    return { error: TOO_MANY_ATTEMPTS_ERROR };
  }

  const supabase = await createClient();

  // Case-insensitiver Vorab-Check statt eines DB-Unique-Constraints: die
  // Profile-Tabelle existiert schon mit ggf. vorhandenen Alt-Daten, ein
  // nachträglicher unique-Index könnte auf bestehenden Kollisionen scheitern.
  // Kein hartes Sicherheitsmerkmal (anders als z.B. der Cooldown-Trigger in
  // 0024) — ein sehr seltenes Race zwischen zwei gleichzeitigen
  // Registrierungen mit demselben Namen ist hier tolerierbar.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .ilike("display_name", escapeLikePattern(displayName))
    .maybeSingle();

  if (existing) {
    return { error: "Dieser Benutzername ist bereits vergeben." };
  }

  // Optionales verstecktes Feld "next" (siehe RegistrierenForm.tsx): wohin
  // es nach der Bestätigung weitergeht, z.B. zurück in den Recorder, wenn
  // das Konto nur angelegt wurde, um eine als Gast aufgezeichnete Fahrt zu
  // speichern (FreeRideForm.tsx). FormData ist vollständig
  // client-kontrolliert, der Wert läuft deshalb durch safeInternalPath —
  // sonst würde daraus ein Open-Redirect, hier sogar einer, der als Link in
  // einer echten Bestätigungsmail landet. Der Callback prüft den Wert
  // unabhängig davon ein zweites Mal (app/auth/callback/route.ts).
  //
  // Der Wert reist ausserdem im Cookie mit (merkeBestaetigung unten), denn
  // die Bestätigungsmail trägt seit der Umstellung auf den Code keinen Link
  // mehr, über den er zurückkäme — siehe
  // supabase/email-vorlagen/README.md. emailRedirectTo bleibt trotzdem
  // gesetzt: es kostet nichts, und es hält den Weg über den Link offen,
  // falls die Vorlage im Dashboard je wieder {{ .ConfirmationURL }} zeigt.
  const origin = await getOrigin();
  const next = safeInternalPath(formData.get("next"));
  const emailRedirectTo = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

  // Über welchen Creator-Link dieses Konto entsteht (lib/herkunft.ts, gesetzt
  // in app/c/[code]/route.ts). Kann Tage alt sein — genau dafür ist es da.
  //
  // Der Umweg über options.data ist nicht Bequemlichkeit, sondern notwendig:
  // Bei aktivierter E-Mail-Bestätigung gibt signUp() keine Session zurück.
  // Das Profil entsteht erst durch den Trigger handle_new_user auf
  // auth.users (0001), es gibt in diesem Moment also keinen eingeloggten
  // Nutzer, in dessen Namen sich eine Zeile schreiben liesse. Der Wert
  // landet damit in raw_user_meta_data, wo der Trigger ihn findet.
  //
  // Dass raw_user_meta_data client-setzbar ist, ist bekannt und hier
  // folgenlos: 0088 prüft den Code gegen creator_links, bevor er irgendwo
  // gezählt wird. Was hier mitfährt, ist ein Vorschlag, keine Tatsache.
  const herkunft = await leseHerkunft();

  // Der Promo-Code kommt als verstecktes Feld aus dem Signup-Form
  // (app/registrieren/page.tsx liest ?promo= aus der URL). Der Code
  // ist client-setzbar — genauso wie herkunft_code. Deshalb
  // entscheidet handle_new_user() in der Datenbank (0121), nicht
  // hier: wir schicken ihn nur als Vorschlag mit.
  const promoCodeRaw = formData.get("promo_code")?.toString().trim();
  const promoCode =
    promoCodeRaw && /^[a-z0-9-]{2,32}$/.test(promoCodeRaw)
      ? promoCodeRaw.toLowerCase()
      : null;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        ...(herkunft ? { herkunft_code: herkunft } : {}),
        ...(promoCode ? { promo_code: promoCode } : {}),
      },
      emailRedirectTo,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Bei aktivierter E-Mail-Bestätigung liefert signUp() für eine bereits
  // registrierte, bestätigte Adresse keinen Fehler — erkennbar nur daran,
  // dass identities leer bleibt. Um keine Konto-Enumeration zu ermöglichen,
  // läuft dieser Fall durch denselben Pfad wie eine Neuregistrierung
  // (Cookie + Redirect auf die Code-Seite, keine verräterische Meldung).
  // Wer dort wirklich neu ist, bekommt den Code; wer schon registriert ist,
  // kann über "Code erneut senden" bzw. die Anmeldung weiter — der
  // Unterschied ist für einen Beobachter nicht sichtbar.
  if (data.user?.identities?.length === 0) {
    await merkeBestaetigung(email, next);
    redirect(BESTAETIGUNG_PFAD);
  }

  // Ab hier ist das Konto angelegt und die Herkunft steht (oder steht
  // nicht) in der Datenbank — das Cookie hat seinen Zweck erfüllt. Vor den
  // beiden redirect()-Aufrufen, weil redirect() wirft und alles danach
  // nicht mehr läuft. Nicht auf dem Fehlerpfad darüber: wer beim zweiten
  // Versuch durchkommt, soll seine Herkunft behalten.
  //
  // Aufräumen darf die Registrierung nicht kosten: das Konto existiert an
  // dieser Stelle bereits. Würde das Löschen des Cookies werfen, sähe der
  // Nutzer einen Fehler, wäre weder angemeldet noch weitergeleitet, und der
  // zweite Versuch liefe erneut auf die Bestätigungsseite. Ein
  // zurückgebliebenes Cookie ist dagegen folgenlos — es läuft ab, und ein
  // zweites Konto legt dieselbe Person nicht an. Dieselbe Abwägung wie bei
  // avatareEntfernen() in deleteAccount().
  try {
    await verbraucheHerkunft();
  } catch (fehler) {
    console.error(
      "Herkunfts-Cookie konnte nach der Registrierung nicht gelöscht werden",
      fehler,
    );
  }

  // Ist "Confirm email" im Supabase-Projekt deaktiviert, liefert signUp
  // bereits eine aktive Session — dann direkt einloggen statt auf eine
  // (nie versendete) Bestätigungsmail zu verweisen. Führt wie der
  // E-Mail-Bestätigungslink (app/auth/callback/route.ts) zum next-Ziel,
  // sonst in die Einrichtung (app/einrichten) statt ohne ein Wort auf die
  // Startseite. Ein fester interner Pfad — safeInternalPath betrifft ihn nicht.
  if (data.session) {
    redirect(next ?? EINRICHTUNG_PFAD);
  }

  // Adresse und Rücksprungziel für das Einlösen des Codes merken. MUSS vor
  // dem redirect() stehen — das wirft, und ohne das Cookie stünde die
  // Bestätigungsseite ohne die Adresse da, die verifyOtp verlangt: Konto
  // angelegt, Code verschickt, niemand kann ihn eingeben. Begründung, warum
  // die Adresse aus einem Cookie und nicht aus dem Formular kommt, steht in
  // lib/bestaetigung.ts.
  await merkeBestaetigung(email, next);

  redirect(BESTAETIGUNG_PFAD);
}

export interface BestaetigungState {
  error: string | null;
}

// Löst den Code aus der Registrierungsmail ein (Länge: CODE_LAENGE).
//
// Das Gegenstück zum Link-Weg in app/auth/callback/route.ts, und aus dem
// Grund gebaut, der dort im Fehlerfall steht: der Link wird per PKCE
// eingelöst, und der Prüfwert dafür liegt als Cookie in genau dem Browser,
// aus dem die Registrierung kam. Wer die E-Mail auf dem Handy öffnet,
// nachdem er sich am Rechner registriert hat, kommt damit nicht durch — und
// das ist der Normalfall, nicht der Ausnahmefall. Ein abgetippter Code hat
// diese Bindung nicht.
//
// Die Adresse kommt AUSSCHLIESSLICH aus dem Cookie, nie aus dem Formular
// (lib/bestaetigung.ts erklärt, warum). Der Code selbst ist die einzige
// Eingabe.
export async function bestaetigeRegistrierung(
  _prevState: BestaetigungState,
  formData: FormData,
): Promise<BestaetigungState> {
  const offen = await leseBestaetigung();
  if (!offen) {
    return {
      error:
        "Wir wissen nicht mehr, für welche Adresse der Code gilt. Bitte melde dich an oder registriere dich erneut.",
    };
  }

  const code = codeNormalisieren(formData.get("code"));
  if (!code) {
    return {
      error: `Bitte gib den ${CODE_LAENGE}-stelligen Code aus der E-Mail ein.`,
    };
  }

  // Der Code hat (bei acht Ziffern) 10^8 Möglichkeiten und gilt 60 Minuten
  // — ohne Bremse wäre er in dieser Zeit trotzdem durchprobierbar. Mit zehn
  // Versuchen je zehn Minuten sind es über die Gültigkeitsdauer 60
  // Versuche; für eine Nutzerin, die sich zweimal vertippt, ist es
  // weiterhin unmerklich.
  //
  // "60" ist dabei die Zahl PRO SERVERLESS-INSTANZ, nicht global:
  // isRateLimitedByKey hält seinen Zähler in einer Map auf Modulebene
  // (lib/rateLimit.ts sagt das ausdrücklich), ein verteilter Angreifer
  // bekommt das Budget also mal Anzahl warmer Instanzen. Selbst bei
  // unrealistisch vielen bleibt die Latte hoch (60/10^8 je Instanz), aber
  // die Aussage "höchstens 60" stand hier zu Unrecht — sie ist eine
  // Obergrenze je Instanz, keine über das System. Dieselbe Einschränkung
  // steht am Callback (app/auth/callback/route.ts).
  //
  // Zwei Schlüssel wie in signIn: einer pro Adresse (bremst das Erraten
  // eines bestimmten Codes über wechselnde IPs) und einer pro IP (bremst
  // das Durchprobieren vieler Adressen von derselben Quelle). Der
  // Adress-Schlüssel ist der wichtigere — die Adresse aus dem Cookie ist
  // zwar von Hand setzbar, aber genau dann greift er.
  const ip = await currentIp();
  if (
    isRateLimitedByKey(`bestaetigen:ip:${ip}`, 30, 10 * 60_000) ||
    isRateLimitedByKey(
      `bestaetigen:email:${offen.email.toLowerCase()}`,
      10,
      10 * 60_000,
    )
  ) {
    return { error: TOO_MANY_ATTEMPTS_ERROR };
  }

  const supabase = await createClient();
  // OTP_SIGNUP ist der Code aus der Registrierungsmail — dieselbe
  // Einmal-Nummer, die im token_hash-Weg des Callbacks steckt, nur
  // abgetippt statt angeklickt (lib/otpTyp.ts). Bei Erfolg legt der
  // Server-Client die Session in die Cookies der Antwort — ab hier ist die
  // Person angemeldet, ein zusätzliches signInWithPassword braucht es nicht.
  const { error } = await supabase.auth.verifyOtp({
    email: offen.email,
    token: code,
    type: OTP_SIGNUP,
  });

  if (error) {
    // Bewusst eine Meldung für alle Fehlschläge: falsche Ziffern,
    // abgelaufener Code und schon eingelöster Code sollen sich nicht
    // unterscheiden lassen. Sonst wäre die Antwort ein Orakel darüber, ob zu
    // einer von Hand ins Cookie geschriebenen Adresse überhaupt eine offene
    // Bestätigung existiert.
    return {
      error:
        "Der Code stimmt nicht oder ist abgelaufen. Prüfe die Ziffern oder fordere einen neuen an.",
    };
  }

  // Verbraucht, nicht ablaufen lassen: es gibt nichts mehr zu bestätigen,
  // und ein stehengebliebenes Cookie würde die Seite weiter anbieten. Vor
  // dem redirect(), das wirft.
  await verbraucheBestaetigung();

  // Ohne eigenes Ziel in die Einrichtung (Fahrzeug, Pässe) — dieselbe
  // Regel wie beim sofortigen Login in signUp() oben. Ein next aus dem
  // Fazit einer Gastfahrt gewinnt weiterhin: die Fahrt zu speichern ist
  // wichtiger als alles, was die Einrichtung fragt.
  redirect(offen.next ?? EINRICHTUNG_PFAD);
}

export interface ErneutSendenState {
  error: string | null;
  gesendet: boolean;
}// Schickt einen neuen Code an dieselbe Adresse.
//
// Nötig, weil der Code 60 Minuten gilt und eine Registrierungsmail, die im
// Spam-Ordner gelandet oder in einem geschlossenen Tab vergessen worden ist,
// sonst in eine Sackgasse führt: Konto existiert, Anmeldung verweigert,
// nichts nachzubestellen. Genau dort kommt auch signIn() heraus.
//
// Ohne Parameter, obwohl useActionState die Action mit (Zustand, FormData)
// aufruft: hier wird beides nicht gebraucht — die Adresse steht im Cookie,
// und das Formular hat kein Feld. Ein ungenutztes `_prevState` stünde als
// letztes Argument da und wäre genau das, was no-unused-vars meldet (anders
// als in den Actions darüber, wo ein benutztes formData dahinter folgt).
export async function sendeBestaetigungErneut(): Promise<ErneutSendenState> {
  const offen = await leseBestaetigung();
  if (!offen) {
    return {
      error:
        "Wir wissen nicht mehr, an welche Adresse der Code gehen soll. Bitte melde dich an oder registriere dich erneut.",
      gesendet: false,
    };
  }

  // Strenger als die Bremse beim Einlösen, weil hier jeder Aufruf eine
  // E-Mail auslöst: an eine fremde Adresse liessen sich sonst von diesem
  // Formular aus beliebig viele schicken. Drei je zehn Minuten reichen für
  // „nichts angekommen, nochmal" und nicht für mehr.
  const ip = await currentIp();
  if (
    isRateLimitedByKey(`bestaetigen:erneut:ip:${ip}`, 5, 10 * 60_000) ||
    isRateLimitedByKey(
      `bestaetigen:erneut:email:${offen.email.toLowerCase()}`,
      3,
      10 * 60_000,
    )
  ) {
    return { error: TOO_MANY_ATTEMPTS_ERROR, gesendet: false };
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  // NICHT ABGEWARTET — dieselbe Vorsichtsmassnahme wie in
  // requestPasswordReset() darunter, und aus demselben gemessenen Grund: das
  // Supabase-Gateway bricht den Versand-Endpunkt nach 10 s ab und wiederholt
  // ihn dreimal, der Client bekommt nach rund 36 s einen 504, während die
  // E-Mail längst unterwegs ist. Ein so lange offener POST wird von einem
  // Browser im Mobilfunk abgebrochen, die Action wirft, und app/error.tsx
  // zeigt einen Fehlerschirm — für einen Versand, der geglückt ist.
  //
  // Anders als beim Zurücksetzen muss die Antwort hier auf GAR NICHTS
  // warten: es gibt kein PKCE-Prüfwert-Cookie, das sie tragen müsste (der
  // Code wird abgetippt, nicht angeklickt), also entfällt auch
  // warteAufPruefwert().
  const versand = supabase.auth
    .resend({
      type: OTP_SIGNUP,
      email: offen.email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    })
    // Die Behandlung hängt hier und nicht erst im after()-Callback: sonst
    // läge zwischen dem Start des Versands und dem Anhängen des Handlers ein
    // Fenster, in dem eine Rejection unbehandelt wäre — und eine
    // unbehandelte Rejection beendet den Node-Prozess.
    //
    // NUR INS SERVERLOG, NIE IN DIE ANTWORT: ein Fehler hier unterschiede
    // die Antwort danach, ob zu der Adresse überhaupt eine unbestätigte
    // Registrierung existiert.
    .then(({ error }) => {
      if (error) {
        console.error("Bestätigungscode: Versand fehlgeschlagen", {
          status: error.status,
          code: error.code,
          message: error.message,
        });
      }
    })
    .catch((fehler) => {
      console.error("Bestätigungscode: Versand geworfen", fehler);
    });

  // Hält die Funktion über die Antwort hinaus am Leben, damit der Versand zu
  // Ende läuft und sein Ergebnis im Log landet — dasselbe Muster wie beim
  // Klickzähler in app/c/[code]/route.ts. Reicht die Max-Duration der Route
  // nicht, geht die LOG-ZEILE verloren, nicht die E-Mail: sobald die Anfrage
  // bei GoTrue liegt, verschickt der unabhängig von uns weiter.
  after(() => versand);

  // Das Cookie bleibt stehen und wird nur verlängert: die Adresse gilt
  // weiter, und der neue Code soll seine 60 Minuten nicht mit dem Rest der
  // alten Cookie-Laufzeit teilen müssen.
  await merkeBestaetigung(offen.email, offen.next);

  return { error: null, gesendet: true };
}

export interface CodeAnfordernState {
  error: string | null;
  gesendet: boolean;
}

// Code an eine frei eingegebene Adresse schicken — für den Gerätewechsel:
// am Laptop registriert, am Handy bestätigt (dort steht kein Cookie, also
// zeigte die Seite bisher nur "melde dich an"). Die Antwort ist immer
// gleich, ob zu der Adresse eine offene Registrierung existiert oder
// nicht (nur das Serverlog unterscheidet) — sonst wäre das Formular ein
// Orakel über fremde Konten. Die eigentliche Bremse gegen Raten steht wie
// überall beim Einlösen (bestaetigeRegistrierung: 10 je Adresse und
// 30 je IP in zehn Minuten).
//
// Schickt an eine Adresse ohne offene Registrierung nichts (resend
// scheitert dort), setzt das Cookie aber trotzdem: die Code-Seite braucht
// die Adresse, und ein falscher Code scheitert generisch — derselbe Stand
// wie nach einer echten Registrierung mit falschem Code.
export async function fordereCodeFuerAdresse(
  _prevState: CodeAnfordernState,
  formData: FormData,
): Promise<CodeAnfordernState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .slice(0, MAX_EMAIL_LENGTH);
  if (!email.includes("@")) {
    return { error: "Bitte gib eine gültige E-Mail-Adresse ein.", gesendet: false };
  }

  // Strenger als das Einlösen, weil jeder Aufruf einen Versand auslösen
  // kann: 5 je IP und 3 je Adresse in zehn Minuten — wie beim erneuten
  // Senden. Bei Überschreitung dieselbe Erfolgsantwort wie unten (die
  // Ursache steht nur im Log), damit sich Brems- und Normalfall nicht
  // unterscheiden lassen.
  const ip = await currentIp();
  if (
    isRateLimitedByKey(`code-anfordern:ip:${ip}`, 5, 10 * 60_000) ||
    isRateLimitedByKey(`code-anfordern:email:${email.toLowerCase()}`, 3, 10 * 60_000)
  ) {
    // Das Cookie trotzdem setzen: sonst lädt die Seite nach der
    // "Code ist unterwegs"-Antwort wieder ins Adressformular statt ins
    // Code-Formular — ein früher verschickter Code liesse sich nicht
    // eingeben, und der Nutzer stünde fest.
    await merkeBestaetigung(email, null);
    return { error: null, gesendet: true };
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  // NICHT ABGEWARTET — derselbe 36-s-Gateway-Abbruch wie in
  // sendeBestaetigungErneut/requestPasswordReset: die Antwort steht sofort,
  // der Versand läuft per after() weiter, Fehler nur ins Serverlog (siehe
  // oben, warum nie in die Antwort).
  const versand = supabase.auth
    .resend({
      type: OTP_SIGNUP,
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    })
    .then(({ error }) => {
      if (error) {
        console.error("Bestätigungscode (Gerätewechsel): Versand fehlgeschlagen", {
          status: error.status,
          code: error.code,
          message: error.message,
        });
      }
    })
    .catch((fehler) => {
      console.error("Bestätigungscode (Gerätewechsel): Versand geworfen", fehler);
    });

  after(() => versand);

  // Setzt das Cookie für diese Adresse neu (60 Minuten ab jetzt), damit das
  // Code-Formular weiss, welche Adresse gemeint ist. Muss vor der Antwort
  // stehen — after() gilt nur dem Versand, nicht dem Cookie.
  await merkeBestaetigung(email, null);

  return { error: null, gesendet: true };
}

export interface RequestPasswordResetState {
  error: string | null;
  requested: boolean;
}

export async function requestPasswordReset(
  _prevState: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .slice(0, MAX_EMAIL_LENGTH);
  if (!email)
    return { error: "Bitte E-Mail-Adresse eingeben.", requested: false };

  // Verhindert, dass eine einzelne Adresse mit E-Mails zugespamt wird
  // (jede Anfrage löst einen Versand aus) bzw. viele Adressen von derselben
  // Quelle zur Konto-Enumeration durchprobiert werden.
  const ip = await currentIp();
  if (
    isRateLimitedByKey(`pwreset:ip:${ip}`, 10, 10 * 60_000) ||
    isRateLimitedByKey(`pwreset:email:${email.toLowerCase()}`, 3, 10 * 60_000)
  ) {
    // Dieselbe konstante Erfolgsmeldung wie unten (kein Verrutschen in eine
    // erkennbar andere Antwort) — die Ursache steht nur im Serverlog.
    return { error: null, requested: true };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  // next ist hier ein fest verdrahteter interner Pfad, kein Nutzereingabewert
  // — dieselbe origin+next-Konkatenation wie beim bestehenden E-Mail-
  // Bestätigungslink in signUp() (siehe app/auth/callback/route.ts).
  //
  // Über die Konstante statt als Literal: der Callback setzt das
  // Wiederherstellungs-Merkmal nur für exakt diesen Pfad. Liefen die beiden
  // auseinander, käme niemand mehr durch den Zurücksetzen-Fluss — er
  // landete auf der Seite, die ihn nach dem alten Passwort fragt.
  // NICHT abgewartet — das ist der Kern dieser Änderung.
  //
  // Gemessen am 2026-09-16 gegen die Produktion: /auth/v1/recover wird vom
  // Supabase-Gateway nach 10 s abgebrochen und dreimal wiederholt, der
  // Client bekommt nach rund 36 s einen 504; der Versand selbst läuft weiter
  // und war nach 83 s erfolgreich. So lange stand "Wird gesendet…" im
  // Formular — und ein Browser, der einen POST nicht beliebig lange offen
  // hält (Mobilfunk, Tabwechsel), brach ihn ab: die Action warf, und
  // app/error.tsx zeigte einen Fehlerschirm. Beide Symptome, ein Grund.
  //
  // Warten muss die Antwort nur auf eines: das PKCE-Prüfwert-Cookie, ohne
  // das sich der Link aus der E-Mail später nicht einlösen liesse. Das legt
  // auth-js ab, BEVOR es die Anfrage abschickt (gemessen: 7 ms gegen 1229 ms
  // bis zur Antwort). Siehe lib/pruefwertCookie.ts.
  const versand = supabase.auth
    .resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(PASSWORT_AENDERN_PFAD)}`,
    })
    // Die Behandlung haengt hier und nicht erst im after()-Callback: sonst
    // laege zwischen dem Start des Versands und dem Anhaengen des Handlers
    // ein Fenster, in dem eine Rejection unbehandelt waere — und eine
    // unbehandelte Rejection beendet den Node-Prozess.
    //
    // NUR INS SERVERLOG, NIE IN DIE ANTWORT.
    //
    // Bei einer unbekannten Adresse antwortet resetPasswordForEmail
    // fehlerfrei (Supabase verhindert so selbst schon Konto-Enumeration) —
    // es wird ja gar nichts verschickt. Daraus folgt die Umkehrung: ein
    // Fehler entsteht hier ausschliesslich fuer eine Adresse, zu der ein
    // Konto existiert. Eine daran haengende Meldung unterschiede die Antwort
    // also nach Kontoexistenz und waere genau das Orakel, das die konstante
    // Antwort verhindern soll. Die Eigenschaft steht namentlich in
    // docs/audit/security.md unter "What is done well", ausdruecklich damit
    // sie nicht versehentlich rueckgaengig gemacht wird. Seit der Versand
    // nicht mehr abgewartet wird, ist sie ohnehin unvermeidbar: die Antwort
    // steht, bevor das Ergebnis vorliegt.
    .then(({ error }) => {
      if (error) {
        console.error("Passwort-Zuruecksetzen: Versand fehlgeschlagen", {
          status: error.status,
          code: error.code,
          message: error.message,
        });
      }
    })
    .catch((fehler) => {
      console.error("Passwort-Zuruecksetzen: Versand geworfen", fehler);
    });

  // after() haelt die Funktion ueber die Antwort hinaus am Leben, damit der
  // Versand zu Ende laeuft und sein Ergebnis im Log landet — dasselbe Muster
  // wie der Klickzaehler in app/c/[code]/route.ts.
  //
  // Es laeuft laut node_modules/next/dist/docs/01-app/03-api-reference/
  // 04-functions/after.md nur bis zur Max-Duration der Route. Reicht die
  // nicht, geht die LOG-ZEILE verloren, nicht die E-Mail: sobald die Anfrage
  // bei GoTrue liegt, verschickt der unabhaengig von uns weiter — gemessen
  // am 2026-09-16, als unser Client nach 36 s aufgab und der Versand nach
  // 83 s trotzdem mit Status 200 fertig wurde.
  after(() => versand);

  // Läuft die Wartezeit ab, wird trotzdem geantwortet: der Versand läuft
  // weiter, und ein fehlender Prüfwert kostet einen zweiten Anlauf — ein
  // hängender Request kostet die ganze Seite.
  if (!(await warteAufPruefwert())) {
    console.error(
      "Passwort-Zuruecksetzen: PKCE-Pruefwert stand nicht rechtzeitig im Cookie-Speicher",
    );
  }

  return { error: null, requested: true };
}

export interface UpdatePasswordState {
  error: string | null;
}

// Verlangt das aktuelle Passwort — ausser die Sitzung stammt gerade aus
// einem Zurücksetzen-Link.
//
// Vorher genügte die blosse Anmeldung. Damit war eine unbeaufsichtigt offene
// Sitzung auf einem geteilten Gerät ein übernommenes Konto: Passwort neu
// setzen, fertig, die eigentliche Besitzerin ausgesperrt. Genau diese
// Begründung steht seit jeher über deleteAccount() weiter unten, das
// deshalb eine Passwort-Neueingabe verlangt — sie gilt hier genauso, und
// das Ergebnis ist sogar unangenehmer: eine gelöschte Kontohülle lässt sich
// nicht weiterbenutzen, ein übernommenes Konto schon.
//
// Die Ausnahme ist der Fall, für den diese Seite ursprünglich gebaut wurde:
// wer sein Passwort vergessen hat, kann es nicht eingeben. Dass genau das
// vorliegt, stellt nicht das Formular fest, sondern der Server — beim
// Einlösen des Links in app/auth/callback/route.ts. Siehe
// lib/passwortWiederherstellung.ts.
export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "").slice(
    0,
    MAX_PASSWORD_LENGTH,
  );
  if (password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { error: "Der Link ist abgelaufen. Bitte fordere einen neuen an." };

  if (!(await istWiederherstellung(user.id))) {
    // Ohne E-Mail-Adresse liesse sich nicht gegenprüfen. Kommt bei einem
    // regulären Konto nicht vor (dieselbe Absicherung wie in
    // deleteAccount), wäre aber der falsche Moment, um es durchzuwinken.
    if (!user.email) {
      return { error: "Passwort konnte nicht geändert werden." };
    }

    const aktuellesPasswort = String(
      formData.get("aktuelles_passwort") ?? "",
    ).slice(0, MAX_PASSWORD_LENGTH);
    if (!aktuellesPasswort) {
      return { error: "Bitte gib dein aktuelles Passwort ein." };
    }

    // Die Prüfung unten ist ein Passwortversuch wie jeder andere und
    // gehört deshalb gebremst — sonst wäre diese Aktion ein Orakel zum
    // Durchprobieren, das die Limits in signIn() umgeht. Pro Konto, weil
    // hier immer schon eine Session existiert.
    if (isRateLimitedByKey(`pwaendern:${user.id}`, 5, 5 * 60_000)) {
      return { error: TOO_MANY_ATTEMPTS_ERROR };
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: aktuellesPasswort,
    });
    if (reauthError) return { error: "Das aktuelle Passwort ist falsch." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Passwort konnte nicht geändert werden." };

  // Verbrauchen, nicht ablaufen lassen: die Ausnahme galt für diesen einen
  // Wechsel. Muss vor dem redirect() stehen — das wirft.
  await verbraucheWiederherstellung();

  redirect("/profil");
}

export interface DeleteAccountState {
  error: string | null;
}

// Löscht kein auth.users-Zeile (siehe 0042_account_deletion.sql für die
// ausführliche Begründung — würde per Cascade Fahrten/Bewertungen/Kudos/
// Follows mitreissen), sondern leert das Profil (Name, Avatar und
// Stripe-Kundenzuordnung auf null, alle Sichtbarkeits- und Status-Flags auf
// false; welche Spalten bewusst stehen bleiben — darunter
// privatzone_radius_m — steht in 0058_kontoloeschung_werte_nullen.sql) und
// entwertet die Zugangsdaten, sodass sich niemand mehr mit dem alten Passwort
// anmelden kann. Verlangt eine erneute Passwort-Eingabe vor der irreversiblen
// Aktion — anders als bei den übrigen destruktiven Aktionen dieser App
// (ConfirmDialog reicht dort), da eine unbeaufsichtigt offene Sitzung
// (geteiltes Gerät, vergessene Abmeldung) sonst mit einem einzigen Klick
// das ganze Konto unwiderruflich deaktivieren könnte.
// Kündigt jedes noch abrechnungsfähige Abo des Nutzers bei Stripe. Gibt
// false zurück, wenn das nicht sicher gelungen ist — der Aufrufer bricht die
// Kontolöschung dann ab. Das ist bewusst die unbequemere Variante: ein Konto,
// das sich gerade nicht löschen lässt, ist ärgerlich, ein gelöschtes Konto
// mit weiterlaufender Belastung wäre schlimmer.
//
// Service-Role-Client, weil stripe_customer_id seit 0027 für
// anon/authenticated nicht lesbar ist. userId stammt aus der oben bereits
// per Passwort re-authentifizierten Session, nie aus einer Nutzereingabe.
async function kuendigeStripeAbo(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) return false;
  if (!profile?.stripe_customer_id) return true;

  try {
    // Bereits beendete Abos brauchen keine Kündigung; ein erneuter Aufruf
    // darauf würde nur einen Fehler erzeugen.
    const beendet = new Set(["canceled", "incomplete_expired"]);
    // Automatische Paginierung: eine einzelne Seite würde bei einem Konto mit
    // vielen beendeten Abos genau das übersehen, worum es hier geht — ein noch
    // abrechenbares Abo hinter der Seitengrenze, das nach der Kontolöschung
    // unsichtbar weiterbucht.
    for await (const abo of getStripe().subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "all",
      limit: 100,
    })) {
      if (beendet.has(abo.status)) continue;
      await getStripe().subscriptions.cancel(abo.id);
    }

    // Offene Kassen-Sitzungen ebenfalls schliessen. Eine TWINT-Zahlung, die
    // erst NACH der Löschung durchgeht, legte sonst bei Stripe ein neues,
    // laufendes Abo an: der Webhook findet dazu kein Profil mehr, protokolliert
    // nur, und das Abo bucht ein gelöschtes Konto weiter ab — genau der Fall,
    // den die Schleife oben für bestehende Abos verhindert.
    //
    // Lässt sich eine Sitzung nicht schliessen (etwa weil ihre Zahlung gerade
    // verarbeitet wird), bricht die Löschung über den catch unten ab, statt
    // sie laufen zu lassen: "in ein paar Minuten nochmals" ist besser als ein
    // Abo ohne Konto.
    for await (const sitzung of getStripe().checkout.sessions.list({
      customer: profile.stripe_customer_id,
      status: "open",
      limit: 100,
    })) {
      await getStripe().checkout.sessions.expire(sitzung.id);
    }
  } catch (fehler) {
    console.error(
      "Stripe-Kündigung bei Kontolöschung fehlgeschlagen",
      { userId },
      fehler,
    );
    return false;
  }

  // Die gespiegelte Zeile mitnehmen: nach der Anonymisierung zeigt sie auf
  // einen Customer, den kein Profil mehr referenziert. Scheitert das, gilt
  // die Löschung als nicht durchgeführt — sonst bliebe eine Abo-Zeile mit
  // einer stripe_customer_id zurück, zu der es kein Profil mehr gibt, und der
  // nächtliche Abgleich würde sie weiter anfassen.
  const { error: loeschFehler } = await admin
    .from("subscriptions")
    .delete()
    .eq("user_id", userId);
  if (loeschFehler) {
    console.error(
      "Abo-Spiegelung bei Kontolöschung nicht gelöscht",
      { userId },
      loeschFehler,
    );
    return false;
  }

  return true;
}

export async function deleteAccount(
  _prevState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return { error: "Bitte melde dich zuerst an." };

  const password = String(formData.get("password") ?? "").slice(
    0,
    MAX_PASSWORD_LENGTH,
  );
  if (!password)
    return { error: "Bitte gib dein Passwort zur Bestätigung ein." };

  // Dieselbe Bremse wie in updatePassword, aus demselben Grund: die Prüfung
  // unten ist ein Passwortversuch wie jeder andere. Ohne sie ist diese
  // Aktion ein Orakel zum Durchprobieren, das die Limits in signIn()
  // umgeht — wer eine Sitzung hat (geteiltes Gerät, ausgelesene Cookies),
  // kann hier beliebig oft raten, und jeder Fehlversuch kostet nichts.
  // Hier wiegt das schwerer als beim Passwortwechsel: ein Treffer löscht
  // das Konto, und die Anonymisierung ist nicht rückholbar.
  // Pro Konto, weil an dieser Stelle immer schon eine Session existiert.
  if (isRateLimitedByKey(`konto-loeschen:${user.id}`, 5, 5 * 60_000)) {
    return { error: TOO_MANY_ATTEMPTS_ERROR };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (reauthError) return { error: "Passwort ist falsch." };

  // Laufendes Abo zuerst bei Stripe kündigen — zwingend VOR der
  // Anonymisierung, denn die nullt stripe_customer_id (0076) und nimmt uns
  // damit den einzigen Zeiger auf den Stripe-Kunden. Ohne diesen Schritt
  // liefe das Abo nach der Kontolöschung unsichtbar weiter und bucht weiter
  // ab, während der Webhook das zugehörige Profil nicht mehr fände.
  const abgebrochen = await kuendigeStripeAbo(user.id);
  if (!abgebrochen) {
    return {
      error:
        "Das laufende Premium-Abo oder eine offene Zahlung liess sich nicht abschliessen. Das Konto wurde deshalb nicht gelöscht — bitte versuche es in ein paar Minuten erneut.",
    };
  }

  // Admin-Client bewusst HIER, vor der Anonymisierung — er wird für beide
  // folgenden Schritte gebraucht. Vorher stand er weiter unten, und der
  // Anonymisierungs-Aufruf lief über den session-gebundenen Client.
  const admin = createAdminClient();

  // Nullt Name und Avatar des Profils, schaltet die Sichtbarkeits- und
  // Status-Flags ab (not null, deshalb false statt null), entfernt die
  // GPS-Tracks, löscht eigene Fahrzeuge und seit 0076 die Abo-Zeile —
  // ohne Letzteres stellt premium_abgleich() (0059, per Cron) ist_premium
  // nachts aus der stehengebliebenen Zeile wieder her. Unberührt bleiben
  // id/created_at, privatzone_radius_m und kudos_gesehen_am.
  //
  // Über den Admin-Client und mit expliziter ID, seit 0076 die
  // parametrisierte Fassung existiert. Die parameterlose
  // anonymize_own_account() bindet sich über auth.uid() und ist an
  // authenticated gegrantet — sie ist damit auch direkt per PostgREST
  // aufrufbar und umgeht dabei die Passwort-Neueingabe oben UND die
  // Stripe-Kündigung. anonymize_account(uuid) ist auf service_role
  // beschränkt und schliesst diesen zweiten Eingang.
  //
  // user.id stammt aus der gerade per Passwort re-authentifizierten
  // Session, nie aus einer Nutzereingabe — dieselbe Regel, der
  // kuendigeStripeAbo() oben schon folgt (siehe AGENTS.md, admin.ts).
  const { error: anonymizeError } = await admin.rpc("anonymize_account", {
    p_user_id: user.id,
  });
  if (anonymizeError) return { error: "Konto konnte nicht gelöscht werden." };

  // Profilbild aus dem Storage nehmen. anonymize_account() nullt oben nur
  // profiles.avatar_url — die Datei selbst bleibt davon unberührt im
  // avatars-Bucket liegen, und der ist öffentlich (0015). Ihr Schlüssel ist
  // "{user_id}/avatar.{endung}", die Nutzer-ID steht in jeder
  // /fahrer/[id]-URL: das Bild eines gelöschten Kontos wäre also weiterhin
  // für jeden abrufbar.
  //
  // Der Ordner wird dafür aufgelistet statt aus BILD_ENDUNGEN zusammengesetzt.
  // Die Endungsliste trifft nur, was bildEndungFuerMime() heute vergibt, und
  // liess damit genau den Fall stehen, um den es hier geht: in Produktion
  // fand sich ein gelöschtes Konto, dessen avatar.jpeg weiter mit HTTP 200
  // antwortete. Begründung in lib/avatarSpeicher.ts.
  //
  // Über den session-gebundenen Client, nicht über den Admin-Client: die
  // Storage-Policy aus 0015 erlaubt dem Nutzer genau das Auflisten und
  // Löschen im eigenen Ordner, ein weiterer RLS-Bypass wäre hier unnötig.
  // Die Session lebt noch (signOut steht unten).
  //
  // Best effort und ausdrücklich kein Abbruch: das Konto ist zu diesem
  // Zeitpunkt bereits anonymisiert, ein Fehlschlag hier darf den Nutzer nicht
  // in einen halb gelöschten Zustand zurückwerfen. Er wird protokolliert.
  const { fehler: avatarFehler } = await avatareEntfernen(
    supabase.storage.from(AVATAR_BUCKET),
    user.id,
  );
  if (avatarFehler) {
    console.error(
      "Avatar bei Kontolöschung nicht entfernt",
      { userId: user.id },
      avatarFehler,
    );
  }

  // Zugangsdaten entwerten: nur über den Admin-Client möglich (Supabase Auth
  // ist kein per-RLS steuerbares Postgres-Schema). Gerechtfertigt trotz
  // Service-Role-RLS-Bypass, weil user.id direkt aus der oben verifizierten,
  // gerade erst per Passwort re-authentifizierten Session stammt — nicht aus
  // einem client-gesteuerten Parameter (siehe AGENTS.md, admin.ts). Die
  // synthetische E-Mail gibt die ursprüngliche Adresse für eine künftige
  // Neu-Registrierung frei und entfernt sie als personenbezogenes Datum aus
  // auth.users; das zufällige Passwort macht die alten Zugangsdaten nutzlos.
  //
  // user_metadata.display_name wird dabei genullt: signUp() legt den bei der
  // Registrierung gewählten Namen dort ab (siehe oben und den Trigger
  // handle_new_user in 0001), er überlebte die Profil-Anonymisierung bisher
  // also als Kopie in auth.users. Ein null-Wert entfernt den Schlüssel aus
  // den Metadaten (GoTrue löscht bei einem Merge genau die Schlüssel, deren
  // Wert null ist), statt ihn nur zu überschreiben.
  //
  // herkunft_code aus demselben Grund: signUp() legt ihn genauso dort ab.
  // anonymize_account() räumt die Herkunft in public auf (0090) — ohne
  // diese Zeile bliebe sie als Kopie in auth.users stehen, wo keine
  // Migration sie je erwischt.
  const { error: revokeError } = await admin.auth.admin.updateUserById(
    user.id,
    {
      email: `geloescht-${user.id}@geloescht.cornice.invalid`,
      password: crypto.randomUUID() + crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { display_name: null, herkunft_code: null },
    },
  );
  if (revokeError) {
    // Profil ist bereits anonymisiert (oben) — dieser Schritt lässt sich
    // gefahrlos erneut versuchen (anonymize_own_account ist idempotent),
    // daher hier abbrechen statt mit ungültigen Zugangsdaten weiterzumachen.
    return {
      error:
        "Konto konnte nicht vollständig gelöscht werden. Bitte versuche es erneut.",
    };
  }

  await supabase.auth.signOut();
  redirect("/");
}
