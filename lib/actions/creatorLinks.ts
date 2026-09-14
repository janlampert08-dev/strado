"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";
import { normalisiereCode, pruefeCreatorLinkEingabe } from "@/lib/creatorLinks";
import { isValidUuid } from "@/lib/validation";

// Verwaltung der Einstiegscodes unter /moderation/creator (Tabelle
// creator_links, Migration 0084).
//
// Zusätzlich zur RLS-Policy "Moderatoren verwalten Creator-Links" auch hier
// explizit prüfen — dieselbe Defense-in-Depth wie in
// lib/actions/moderation.ts, aus demselben Grund: eine künftige, versehentlich
// zu weit gefasste Policy wäre hier sonst ohne jede Anwendungs-Sicherung
// ausnutzbar.
//
// Jede Aktion liefert ihr Ergebnis zurück statt void, und ein Treffer von
// null Zeilen zählt als Fehler: RLS gibt bei fehlender Berechtigung keinen
// Fehler zurück, sondern filtert die Zeile heraus. Ohne count wäre "darf
// nicht" von "hat geklappt" nicht zu unterscheiden. Ausführlich begründet in
// lib/actions/moderation.ts.

export interface CreatorLinkResult {
  error: string | null;
}

const OK: CreatorLinkResult = { error: null };
const NICHT_BERECHTIGT: CreatorLinkResult = {
  error: "Dafür fehlt dir die Berechtigung. Bitte lade die Seite neu.",
};

function nichtGetroffen(was: string): CreatorLinkResult {
  return {
    error: `${was} hat keine Zeile getroffen — entweder ist der Eintrag schon weg, oder dir fehlt die Berechtigung. Bitte lade die Seite neu.`,
  };
}

async function alsModerator(): Promise<
  { userId: string; supabase: Awaited<ReturnType<typeof createClient>> } | CreatorLinkResult
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isModerator(user.id))) return NICHT_BERECHTIGT;
  return { userId: user.id, supabase };
}

function aktualisiere() {
  revalidatePath("/moderation/creator");
}

// Das Formular benutzt useActionState und braucht deshalb (State, FormData).
export async function creatorLinkAnlegen(
  _prevState: CreatorLinkResult,
  formData: FormData,
): Promise<CreatorLinkResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const geprueft = pruefeCreatorLinkEingabe({
    code: formData.get("code"),
    name: formData.get("name"),
    kanal: formData.get("kanal"),
    kampagne: formData.get("kampagne"),
  });
  if (!geprueft.ok) return { error: geprueft.fehler };

  // Optional: das Konto, dem der Code gehört. Leer heisst "niemandem" —
  // ein Code darf ohne Creator-Konto laufen (Plakat, Newsletter, jemand
  // ohne Konto). Der Wert kommt aus einem Auswahlfeld und ist damit
  // client-kontrolliert; geprüft wird hier auf die Form und in der
  // Datenbank auf die Existenz (Fremdschlüssel auf auth.users, 0091).
  const zuweisung = creatorUserIdAus(formData.get("creator_user_id"));
  if (zuweisung === UNGUELTIG) return { error: "Das gewählte Konto ist ungültig." };

  const { error } = await kontext.supabase.from("creator_links").insert({
    ...geprueft.wert,
    creator_user_id: zuweisung,
    erstellt_von: kontext.userId,
  });

  if (error) {
    if (error.code === "23503") {
      return { error: "Das gewählte Konto gibt es nicht (mehr)." };
    }
    // 23505 ist die Unique-Verletzung des Primärschlüssels. Der einzige
    // Fehler hier, den die Moderation selbst beheben kann — deshalb als
    // einziger benannt statt unter "hat nicht geklappt" zu verschwinden.
    if (error.code === "23505") {
      return { error: `Den Code „${geprueft.wert.code}" gibt es schon.` };
    }
    console.error("Creator-Link anlegen fehlgeschlagen", error);
    return { error: "Das Anlegen hat nicht geklappt. Bitte versuche es noch einmal." };
  }

  aktualisiere();
  return OK;
}

// Aktiv/inaktiv statt löschen ist der Normalfall: ein Code, der einmal in
// einer Caption stand, wird weiter angeklickt. Inaktiv heisst, dass
// creator_link_aufloesen() ihn nicht mehr findet — der Besucher landet dann
// ohne Zuordnung auf der Startseite statt auf einer Fehlerseite.
export async function creatorLinkAktivSetzen(
  rohCode: string,
  aktiv: boolean,
): Promise<CreatorLinkResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const code = normalisiereCode(rohCode);
  if (!code) return { error: "Unbekannter Code." };

  const { error, count } = await kontext.supabase
    .from("creator_links")
    .update({ aktiv }, { count: "exact" })
    .eq("code", code);

  const was = aktiv ? "Das Aktivieren" : "Das Deaktivieren";
  if (error) {
    console.error("Creator-Link umschalten fehlgeschlagen", { code }, error);
    return { error: `${was} hat nicht geklappt. Bitte versuche es noch einmal.` };
  }
  if (count === 0) return nichtGetroffen(was);

  aktualisiere();
  return OK;
}

// Endgültig entfernen. Sinnvoll nur für einen Code, der nie verteilt wurde —
// für alles andere ist Deaktivieren das richtige Mittel.
//
// Seit 0088 hängt an einem Code die Herkunft vergebener Registrierungen und
// jede daraus entstandene Konversion. Die Entscheidung darüber ist
// gefallen, und zwar in der Datenbank: beide Tabellen verweisen per
// Fremdschlüssel auf creator_links, das Löschen scheitert also, sobald
// etwas daran hängt. Das ist die richtige Richtung — ein Code, dem
// Registrierungen zugeordnet sind, darf nicht verschwinden, sonst stünde
// in der Auswertung eine Zahl ohne Namen. Unten wird der Fehler nur in
// etwas Lesbares übersetzt.
export async function creatorLinkLoeschen(rohCode: string): Promise<CreatorLinkResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const code = normalisiereCode(rohCode);
  if (!code) return { error: "Unbekannter Code." };

  const { error, count } = await kontext.supabase
    .from("creator_links")
    .delete({ count: "exact" })
    .eq("code", code);

  if (error) {
    // 23503 ist die Fremdschlüsselverletzung: an diesem Code hängen
    // Registrierungen oder Konversionen (0088). Kein Fehler, den die
    // Moderation beheben soll — sondern einer, der sagt, dass hier
    // Deaktivieren das richtige Mittel ist.
    if (error.code === "23503") {
      return {
        error: `Über den Code „${code}" sind schon Registrierungen gelaufen. Er lässt sich nicht mehr löschen — deaktiviere ihn stattdessen.`,
      };
    }
    console.error("Creator-Link löschen fehlgeschlagen", { code }, error);
    return { error: "Das Löschen hat nicht geklappt. Bitte versuche es noch einmal." };
  }
  if (count === 0) return nichtGetroffen("Das Löschen");

  aktualisiere();
  return OK;
}

// Ein leeres Feld heisst "keine Zuweisung" und ist gültig; alles, was kein
// UUID ist, heisst "kaputtes Formular" und ist es nicht. Beides von null zu
// unterscheiden verlangt einen dritten Wert — sonst würde eine manipulierte
// Eingabe stillschweigend zu "niemandem" und die Zuweisung ginge verloren.
const UNGUELTIG = Symbol("ungueltige-creator-zuweisung");

function creatorUserIdAus(roh: FormDataEntryValue | null): string | null | typeof UNGUELTIG {
  if (typeof roh !== "string") return null;
  const wert = roh.trim();
  if (!wert) return null;
  return isValidUuid(wert) ? wert : UNGUELTIG;
}

// Einen Code einem Konto zuweisen oder die Zuweisung entfernen (leeres
// Feld).
//
// Das ist die Vergabe der Creator-Rolle: es gibt keine Spalte
// profiles.ist_creator — wer hier eingetragen wird, sieht /creator und
// seine eigenen Zahlen (Migration 0091). Deshalb steht die Aktion neben den
// anderen Moderationsaktionen und hinter derselben dreifachen Schranke.
//
// (State, FormData) wie creatorLinkAnlegen, weil das Formular
// useActionState benutzt: dasselbe Auswahlfeld dient dem Zuweisen und dem
// Entfernen — ein geleertes Feld ist die Rücknahme.
export async function creatorLinkZuweisen(
  _prevState: CreatorLinkResult,
  formData: FormData,
): Promise<CreatorLinkResult> {
  const kontext = await alsModerator();
  if ("error" in kontext) return kontext;

  const code = normalisiereCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Unbekannter Code." };

  const zuweisung = creatorUserIdAus(formData.get("creator_user_id"));
  if (zuweisung === UNGUELTIG) return { error: "Das gewählte Konto ist ungültig." };

  const { error, count } = await kontext.supabase
    .from("creator_links")
    .update({ creator_user_id: zuweisung }, { count: "exact" })
    .eq("code", code);

  const was = zuweisung ? "Das Zuweisen" : "Das Entfernen der Zuweisung";
  if (error) {
    // 23503: der Fremdschlüssel auf auth.users greift — das Konto gibt es
    // nicht. Kann im Normalbetrieb nur passieren, wenn es zwischen Auswahl
    // und Absenden verschwunden ist.
    if (error.code === "23503") return { error: "Das gewählte Konto gibt es nicht (mehr)." };
    console.error("Creator-Zuweisung fehlgeschlagen", { code }, error);
    return { error: `${was} hat nicht geklappt. Bitte versuche es noch einmal.` };
  }
  if (count === 0) return nichtGetroffen(was);

  aktualisiere();
  return OK;
}
