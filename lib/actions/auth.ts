"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin, safeInternalPath } from "@/lib/utils/url";
import { getClientIp, isRateLimitedByKey } from "@/lib/rateLimit";
import { stripe } from "@/lib/stripe";
import { BILD_ENDUNGEN } from "@/lib/validation";
import {
  PASSWORT_AENDERN_PFAD,
  istWiederherstellung,
  verbraucheWiederherstellung,
} from "@/lib/passwortWiederherstellung";

export interface AuthFormState {
  error: string | null;
}

// Grenzen gegen übergrosse/unsinnige Eingaben, bevor sie überhaupt an
// Supabase Auth gehen — kein hartes Sicherheitsmerkmal (Supabase validiert
// selbst), aber verhindert unnötig grosse Requests/Payloads.
const MAX_EMAIL_LENGTH = 255;
const MAX_PASSWORD_LENGTH = 200;

const TOO_MANY_ATTEMPTS_ERROR = "Zu viele Versuche. Bitte warte ein paar Minuten und versuche es erneut.";

async function currentIp(): Promise<string> {
  return getClientIp(await headers());
}

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").slice(0, MAX_EMAIL_LENGTH);
  const password = String(formData.get("password") ?? "").slice(0, MAX_PASSWORD_LENGTH);

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "Bitte bestätige zuerst deine E-Mail-Adresse (Link in der E-Mail).",
      };
    }
    return { error: "E-Mail oder Passwort ist falsch." };
  }

  // Optionales verstecktes Feld "next" (siehe AnmeldenForm.tsx) bringt
  // Nutzer nach der Anmeldung dorthin, wofür sie sich angemeldet haben —
  // etwa /fahrten/neu nach einem Klick auf "Fahrt starten". FormData ist
  // vollständig client-kontrolliert, der Wert läuft deshalb durch
  // safeInternalPath: ohne diese Prüfung liesse sich die Anmeldung als
  // Open-Redirect auf eine fremde Domain missbrauchen (Phishing-Seite, die
  // nach einer echten Anmeldung erscheint). Ohne/ungültiges Feld bleibt
  // /profil das unveränderte Standardziel.
  redirect(safeInternalPath(formData.get("next")) ?? "/profil");
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
  const password = String(formData.get("password") ?? "").slice(0, MAX_PASSWORD_LENGTH);
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
  const origin = await getOrigin();
  const next = safeInternalPath(formData.get("next"));
  const emailRedirectTo = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Bei aktivierter E-Mail-Bestätigung liefert signUp() für eine bereits
  // registrierte, bestätigte Adresse keinen Fehler (Supabase schützt so
  // selbst gegen Enumeration) — erkennbar nur daran, dass identities leer
  // bleibt statt eine neue Identity zu enthalten. Offiziell von Supabase
  // dokumentierter Weg, das client-seitig zu unterscheiden, um dem Nutzer
  // trotzdem eine Rückmeldung zu geben statt ihn auf eine nie versendete
  // Bestätigungsmail warten zu lassen.
  if (data.user?.identities?.length === 0) {
    return { error: "Diese E-Mail-Adresse ist bereits registriert." };
  }

  // Ist "Confirm email" im Supabase-Projekt deaktiviert, liefert signUp
  // bereits eine aktive Session — dann direkt einloggen statt auf eine
  // (nie versendete) Bestätigungsmail zu verweisen. Führt wie der
  // E-Mail-Bestätigungslink (app/auth/callback/route.ts) zum next-Ziel,
  // sonst unverändert zur Startseite.
  if (data.session) {
    redirect(next ?? "/");
  }

  redirect("/registrieren/bestaetigen");
}

export interface RequestPasswordResetState {
  error: string | null;
  requested: boolean;
}

export async function requestPasswordReset(
  _prevState: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "").trim().slice(0, MAX_EMAIL_LENGTH);
  if (!email) return { error: "Bitte E-Mail-Adresse eingeben.", requested: false };

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
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(PASSWORT_AENDERN_PFAD)}`,
  });

  // resetPasswordForEmail liefert bei unbekannter Adresse ebenfalls keinen
  // Fehler (Supabase verhindert damit selbst schon Konto-Enumeration) — die
  // konstante Erfolgsmeldung hier ist daher die korrekte Antwort in beiden
  // Fällen, kein Verstecken eines echten Fehlers.
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
  const password = String(formData.get("password") ?? "").slice(0, MAX_PASSWORD_LENGTH);
  if (password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Der Link ist abgelaufen. Bitte fordere einen neuen an." };

  if (!(await istWiederherstellung(user.id))) {
    // Ohne E-Mail-Adresse liesse sich nicht gegenprüfen. Kommt bei einem
    // regulären Konto nicht vor (dieselbe Absicherung wie in
    // deleteAccount), wäre aber der falsche Moment, um es durchzuwinken.
    if (!user.email) {
      return { error: "Passwort konnte nicht geändert werden." };
    }

    const aktuellesPasswort = String(formData.get("aktuelles_passwort") ?? "").slice(
      0,
      MAX_PASSWORD_LENGTH,
    );
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
    for await (const abo of stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "all",
      limit: 100,
    })) {
      if (beendet.has(abo.status)) continue;
      await stripe.subscriptions.cancel(abo.id);
    }
  } catch (fehler) {
    console.error("Stripe-Kündigung bei Kontolöschung fehlgeschlagen", { userId }, fehler);
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
    console.error("Abo-Spiegelung bei Kontolöschung nicht gelöscht", { userId }, loeschFehler);
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

  const password = String(formData.get("password") ?? "").slice(0, MAX_PASSWORD_LENGTH);
  if (!password) return { error: "Bitte gib dein Passwort zur Bestätigung ein." };

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
        "Das laufende Premium-Abo konnte nicht gekündigt werden. Das Konto wurde deshalb nicht gelöscht — bitte versuche es später erneut.",
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
  // für jeden abrufbar, der die vier möglichen Endungen durchprobiert.
  //
  // Über den session-gebundenen Client, nicht über den Admin-Client: die
  // Storage-Policy aus 0015 erlaubt dem Nutzer genau das Löschen im eigenen
  // Ordner, ein weiterer RLS-Bypass wäre hier unnötig. Die Session lebt noch
  // (signOut steht unten).
  //
  // Best effort und ausdrücklich kein Abbruch: das Konto ist zu diesem
  // Zeitpunkt bereits anonymisiert, ein Fehlschlag hier darf den Nutzer nicht
  // in einen halb gelöschten Zustand zurückwerfen. Er wird protokolliert.
  const avatarPfade = BILD_ENDUNGEN.map((endung) => `${user.id}/avatar.${endung}`);
  const { error: avatarFehler } = await supabase.storage.from("avatars").remove(avatarPfade);
  if (avatarFehler) {
    console.error("Avatar bei Kontolöschung nicht entfernt", { userId: user.id }, avatarFehler);
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
  const { error: revokeError } = await admin.auth.admin.updateUserById(user.id, {
    email: `geloescht-${user.id}@geloescht.cornice.invalid`,
    password: crypto.randomUUID() + crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { display_name: null },
  });
  if (revokeError) {
    // Profil ist bereits anonymisiert (oben) — dieser Schritt lässt sich
    // gefahrlos erneut versuchen (anonymize_own_account ist idempotent),
    // daher hier abbrechen statt mit ungültigen Zugangsdaten weiterzumachen.
    return { error: "Konto konnte nicht vollständig gelöscht werden. Bitte versuche es erneut." };
  }

  await supabase.auth.signOut();
  redirect("/");
}
