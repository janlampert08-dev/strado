"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";
import { normalisiereCode, pruefeCreatorLinkEingabe } from "@/lib/creatorLinks";

// Verwaltung der Einstiegscodes unter /moderation/creator (Tabelle
// creator_links, Migration 0080).
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

  const { error } = await kontext.supabase.from("creator_links").insert({
    ...geprueft.wert,
    erstellt_von: kontext.userId,
  });

  if (error) {
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
// Sobald Phase 2 aus docs/creator-links-plan.md existiert, hängt an einem
// Code die Herkunft vergebener Registrierungen. Dann braucht diese Aktion
// eine Entscheidung darüber, was mit diesen Zeilen passiert; heute gibt es
// sie noch nicht.
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
    console.error("Creator-Link löschen fehlgeschlagen", { code }, error);
    return { error: "Das Löschen hat nicht geklappt. Bitte versuche es noch einmal." };
  }
  if (count === 0) return nichtGetroffen("Das Löschen");

  aktualisiere();
  return OK;
}
