"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";
import { isValidUuid } from "@/lib/validation";

const PASS_ID_MUSTER = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function istPassId(wert: unknown): wert is string {
  return typeof wert === "string" && wert.length <= 60 && PASS_ID_MUSTER.test(wert);
}

/**
 * Einem Pass folgen oder nicht mehr folgen.
 *
 * Kein eigener Cooldown: die Tabelle hat einen zusammengesetzten
 * Primärschlüssel, ein doppeltes Folgen ist also kein neuer Eintrag, und mehr
 * als einen Eintrag je Pass kann niemand erzeugen.
 */
export async function passFolgenUmschalten(passId: string): Promise<{ ok: boolean; folgtMan: boolean }> {
  if (!istPassId(passId)) return { ok: false, folgtMan: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, folgtMan: false };

  const { data: bestehend } = await supabase
    .from("pass_folgen")
    .select("pass_id")
    .eq("pass_id", passId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (bestehend) {
    const { error } = await supabase
      .from("pass_folgen")
      .delete()
      .eq("pass_id", passId)
      .eq("user_id", user.id);
    if (error) return { ok: false, folgtMan: true };
    revalidatePath("/paesse");
    // Der Knopf steht auch auf jeder Streckenseite (PassSektion): ohne diese
    // Zeile bliebe dort der alte Zustand stehen, bis jemand neu lädt.
    // Folgen ist selten, ein Layout-Revalidate dafür vertretbar.
    revalidatePath("/", "layout");
    return { ok: true, folgtMan: false };
  }

  const { error } = await supabase.from("pass_folgen").insert({ pass_id: passId, user_id: user.id });
  if (error) return { ok: false, folgtMan: false };

  revalidatePath("/paesse");
  revalidatePath("/", "layout");
  return { ok: true, folgtMan: true };
}

export interface PassStatusState {
  error: string | null;
  success?: string;
}

const ZUSTAENDE = ["offen", "eingeschraenkt", "gesperrt", "wintersperre"] as const;

/**
 * Passstatus von Hand setzen — die Notbremse hinter dem Feed.
 *
 * Doppelt abgesichert wie jede Moderationshandlung (.agents/backend.md):
 * isModerator() hier, die Rollenprüfung nochmals in pass_status_setzen(). Die
 * Funktion ist SECURITY DEFINER und deshalb die eigentliche Grenze; diese
 * Prüfung erspart dem Nutzer bloss einen Datenbankfehler.
 */
export async function setzePassStatus(
  _prevState: PassStatusState,
  formData: FormData,
): Promise<PassStatusState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };
  if (!(await isModerator(user.id))) return { error: "Nur für Moderatoren." };

  const passId = formData.get("pass_id");
  const zustand = formData.get("zustand");
  const meldung = String(formData.get("meldung") ?? "").trim();
  const tage = Number(formData.get("tage"));

  if (!istPassId(passId)) return { error: "Unbekannter Pass." };
  if (typeof zustand !== "string" || !ZUSTAENDE.includes(zustand as (typeof ZUSTAENDE)[number])) {
    return { error: "Bitte einen Zustand wählen." };
  }
  if (!Number.isInteger(tage) || tage < 1 || tage > 240) {
    return { error: "Die Gültigkeit muss zwischen 1 und 240 Tagen liegen." };
  }
  if (meldung.length > 500) return { error: "Die Meldung ist zu lang (höchstens 500 Zeichen)." };

  const gueltigBis = new Date(Date.now() + tage * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.rpc("pass_status_setzen", {
    p_pass_id: passId,
    p_zustand: zustand,
    p_meldung: meldung || null,
    p_gueltig_bis: gueltigBis,
  });

  if (error) {
    console.error("Passstatus konnte nicht gesetzt werden", { passId }, error);
    return { error: "Das hat nicht geklappt. Bitte versuch es noch einmal." };
  }

  revalidatePath("/moderation");
  revalidatePath("/paesse");
  return { error: null, success: "Status gesetzt." };
}

/** Übersteuerung beenden: ab dem nächsten Abgleich schreibt wieder der Feed. */
export async function gibPassStatusFrei(passId: string): Promise<{ ok: boolean }> {
  if (!istPassId(passId)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isModerator(user.id))) return { ok: false };

  const { error } = await supabase.rpc("pass_status_freigeben", { p_pass_id: passId });
  if (error) return { ok: false };

  revalidatePath("/moderation");
  revalidatePath("/paesse");
  return { ok: true };
}

export interface SperrtagState {
  error: string | null;
  success?: string;
}

const ARTEN = ["autofrei", "veranstaltung", "bauarbeiten", "sonstiges"] as const;
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-13-45" passt auf das Muster und ist trotzdem kein Tag. Ohne diese
 *  Prüfung landet der Wert in der date-Spalte, die ihn ablehnt, und die
 *  Person liest die allgemeine "Das hat nicht geklappt"-Meldung statt zu
 *  erfahren, was falsch ist. */
function istEchtesDatum(wert: string): boolean {
  if (!ISO_DATUM.test(wert)) return false;
  const [jahr, monat, tag] = wert.split("-").map(Number);
  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  return (
    datum.getUTCFullYear() === jahr &&
    datum.getUTCMonth() === monat - 1 &&
    datum.getUTCDate() === tag
  );
}

/** Eine geplante Sperrung in den Kalender legen (Moderation). */
export async function legeSperrtagAn(
  _prevState: SperrtagState,
  formData: FormData,
): Promise<SperrtagState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };
  if (!(await isModerator(user.id))) return { error: "Nur für Moderatoren." };

  const passId = formData.get("pass_id");
  const von = String(formData.get("von") ?? "");
  const bis = String(formData.get("bis") ?? "") || von;
  const art = formData.get("art");
  const titel = String(formData.get("titel") ?? "").trim();
  const zeitfenster = String(formData.get("zeitfenster") ?? "").trim();
  const quelleUrl = String(formData.get("quelle_url") ?? "").trim();

  if (!istPassId(passId)) return { error: "Unbekannter Pass." };
  if (!istEchtesDatum(von) || !istEchtesDatum(bis)) return { error: "Bitte ein gültiges Datum wählen." };
  if (bis < von) return { error: "Das Ende liegt vor dem Anfang." };
  // Dieselbe Grenze wie der Check in 0104 (bis - von <= 366): ohne sie
  // endete ein zu langer Zeitraum in der allgemeinen Fehlermeldung.
  if ((Date.parse(bis) - Date.parse(von)) / 86_400_000 > 366) {
    return { error: "Ein Eintrag umfasst höchstens ein Jahr." };
  }
  if (typeof art !== "string" || !ARTEN.includes(art as (typeof ARTEN)[number])) {
    return { error: "Bitte eine Art wählen." };
  }
  if (titel.length < 3 || titel.length > 120) {
    return { error: "Der Titel muss zwischen 3 und 120 Zeichen lang sein." };
  }
  if (zeitfenster.length > 60) return { error: "Das Zeitfenster ist zu lang." };
  // Wie der Check in 0104: https, keine Leerzeichen, höchstens 500 Zeichen
  // insgesamt (die alte Regel liess 508 durch).
  if (quelleUrl && (quelleUrl.length > 500 || !/^https:\/\/\S{4,}$/.test(quelleUrl))) {
    return { error: "Die Quelle muss eine https-Adresse sein." };
  }

  const { error } = await supabase.from("pass_sperrtage").insert({
    pass_id: passId,
    von,
    bis,
    art,
    titel,
    zeitfenster: zeitfenster || null,
    quelle_url: quelleUrl || null,
    erstellt_von: user.id,
  });

  if (error) {
    console.error("Sperrtag konnte nicht angelegt werden", { passId }, error);
    return { error: "Das hat nicht geklappt. Bitte versuch es noch einmal." };
  }

  revalidatePath("/moderation");
  revalidatePath("/paesse");
  return { error: null, success: "Im Kalender eingetragen." };
}

export async function loescheSperrtag(id: string): Promise<{ ok: boolean }> {
  if (!isValidUuid(id)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isModerator(user.id))) return { ok: false };

  const { error } = await supabase.from("pass_sperrtage").delete().eq("id", id);
  if (error) return { ok: false };

  revalidatePath("/moderation");
  revalidatePath("/paesse");
  return { ok: true };
}
