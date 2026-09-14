"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils/url";
import { isRateLimited } from "@/lib/rateLimit";
import { fahrzeugtypdefinition, kwInPs, psInKw } from "@/lib/motorklassen";
import type { FahrzeugTyp, Getriebe, Vehicle } from "@/types/database";

export interface VehicleFormState {
  error: string | null;
}

interface InsertVehicleResult {
  error: string | null;
  vehicle: Vehicle | null;
}

// Muss mit den DB-Check-Constraints aus 0001_init.sql übereinstimmen
// (typ/getriebe/baujahr) — hier geprüft, um bei ungültigem Wert eine
// verständliche Fehlermeldung statt eines generischen DB-Fehlers zu geben.
const FAHRZEUG_TYPEN: FahrzeugTyp[] = ["auto", "motorrad"];
const GETRIEBE_TYPEN: Getriebe[] = ["manuell", "automatik"];
const MAX_MARKE_MODELL_LENGTH = 60;
const MIN_BAUJAHR = 1900;
const MAX_BAUJAHR = 2100;
// Müssen mit den Check-Constraints aus 0080_motorklassen.sql übereinstimmen.
// Beide Angaben sind freiwillig: ohne leistung_kw hat das Fahrzeug keine
// Motorklasse und die Fahrt zählt weiterhin nur in der Gesamtwertung.
const MAX_HUBRAUM_CCM = 10000;
const MAX_LEISTUNG_KW = 2000;
// Dieselbe Obergrenze, nur in der Einheit, in der ein Auto eingegeben wird.
// Abgeleitet statt abgetippt, damit die beiden Schranken nicht auseinander-
// laufen: psInKw(MAX_LEISTUNG_PS) ergibt wieder genau MAX_LEISTUNG_KW und
// verletzt den CHECK aus 0080 damit nicht.
const MAX_LEISTUNG_PS = kwInPs(MAX_LEISTUNG_KW);
const ADD_VEHICLE_COOLDOWN_MS = 2000;

// Die Leistung kommt je nach Fahrzeugtyp in einer anderen Einheit herein:
// beim Auto in PS, beim Motorrad in kW (Begründung in lib/motorklassen.ts,
// Abschnitt EINHEITEN). Gespeichert wird in beiden Fällen kW, weil die
// Klassenformel — hier wie in public.motorklasse() — ausschliesslich damit
// rechnet.
//
// Welches Feld gelesen wird, entscheidet ausschliesslich der bereits
// geprüfte Typ und nicht, welches Feld mitgeschickt wurde. Sonst könnte ein
// Aufrufer, der beide Felder setzt, sich die Einheit aussuchen und aus
// derselben "35" wahlweise 35 kW oder 26 kW machen — also die Motorklasse
// wählen, statt sie sich zuordnen zu lassen.
function leistungKwAusFormular(
  formData: FormData,
  typ: FahrzeugTyp,
): { kw: number | null; error: string | null } {
  const einheit = fahrzeugtypdefinition(typ).leistungseinheit;
  // Komma als Dezimaltrennzeichen zulassen — auf einem Schweizer Handy ist
  // das die naheliegende Eingabe, und Number("11,5") wäre NaN.
  const roh = String(formData.get(einheit === "PS" ? "leistung_ps" : "leistung_kw") ?? "")
    .trim()
    .replace(",", ".");
  // Die Angabe ist freiwillig: ohne sie hat das Fahrzeug keine Motorklasse
  // und die Fahrt zählt weiterhin nur in der Gesamtwertung.
  if (!roh) return { kw: null, error: null };

  const wert = Number(roh);

  if (einheit === "PS") {
    // Untergrenze 1 PS statt "> 0": psInKw() rundet, und alles darunter
    // ergäbe 0 kW und damit einen Wert, den der CHECK aus 0080 ablehnt.
    if (!Number.isFinite(wert) || wert < 1 || wert > MAX_LEISTUNG_PS) {
      return { kw: null, error: `Leistung muss zwischen 1 und ${MAX_LEISTUNG_PS} PS liegen.` };
    }
    return { kw: psInKw(wert), error: null };
  }

  if (!Number.isFinite(wert) || wert <= 0 || wert > MAX_LEISTUNG_KW) {
    return { kw: null, error: `Leistung muss zwischen 1 und ${MAX_LEISTUNG_KW} kW liegen.` };
  }
  return { kw: wert, error: null };
}

async function insertVehicleFromFormData(formData: FormData): Promise<InsertVehicleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Bitte melde dich zuerst an.", vehicle: null };
  }

  const typ = String(formData.get("typ") ?? "");
  const marke = String(formData.get("marke") ?? "").trim();
  const modell = String(formData.get("modell") ?? "").trim();
  const getriebe = String(formData.get("getriebe") ?? "");
  const baujahrRaw = String(formData.get("baujahr") ?? "").trim();
  const baujahr = baujahrRaw ? Number(baujahrRaw) : null;
  const hubraumRaw = String(formData.get("hubraum_ccm") ?? "").trim();
  const hubraumCcm = hubraumRaw ? Number(hubraumRaw) : null;

  if (!marke || !modell) {
    return { error: "Marke und Modell sind erforderlich.", vehicle: null };
  }
  if (marke.length > MAX_MARKE_MODELL_LENGTH || modell.length > MAX_MARKE_MODELL_LENGTH) {
    return {
      error: `Marke und Modell dürfen höchstens ${MAX_MARKE_MODELL_LENGTH} Zeichen lang sein.`,
      vehicle: null,
    };
  }
  if (!FAHRZEUG_TYPEN.includes(typ as FahrzeugTyp)) {
    return { error: "Bitte einen gültigen Fahrzeugtyp wählen.", vehicle: null };
  }
  if (!GETRIEBE_TYPEN.includes(getriebe as Getriebe)) {
    return { error: "Bitte ein gültiges Getriebe wählen.", vehicle: null };
  }
  if (baujahr !== null && (!Number.isInteger(baujahr) || baujahr < MIN_BAUJAHR || baujahr > MAX_BAUJAHR)) {
    return { error: `Baujahr muss zwischen ${MIN_BAUJAHR} und ${MAX_BAUJAHR} liegen.`, vehicle: null };
  }
  if (
    hubraumCcm !== null &&
    (!Number.isInteger(hubraumCcm) || hubraumCcm <= 0 || hubraumCcm > MAX_HUBRAUM_CCM)
  ) {
    return {
      error: `Hubraum muss eine ganze Zahl zwischen 1 und ${MAX_HUBRAUM_CCM} cm³ sein.`,
      vehicle: null,
    };
  }
  // Erst nach der Typprüfung oben — die Einheit hängt am Typ.
  const { kw: leistungKw, error: leistungError } = leistungKwAusFormular(
    formData,
    typ as FahrzeugTyp,
  );
  if (leistungError) return { error: leistungError, vehicle: null };

  if (
    await isRateLimited(supabase, "vehicles", "created_at", "user_id", user.id, ADD_VEHICLE_COOLDOWN_MS)
  ) {
    return { error: "Bitte warte einen Moment, bevor du ein weiteres Fahrzeug hinzufügst.", vehicle: null };
  }

  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      user_id: user.id,
      typ: typ as FahrzeugTyp,
      marke,
      modell,
      getriebe: getriebe as Getriebe,
      baujahr,
      hubraum_ccm: hubraumCcm,
      leistung_kw: leistungKw,
    })
    .select()
    .single();

  if (error) {
    return { error: "Fahrzeug konnte nicht gespeichert werden.", vehicle: null };
  }

  revalidatePath("/profil");
  return { error: null, vehicle: data as Vehicle };
}

export async function addVehicle(
  _prevState: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const { error } = await insertVehicleFromFormData(formData);
  if (error) return { error };
  // Optionales verstecktes Feld "next" (siehe NeuesFahrzeugForm.tsx) bringt
  // Nutzer nach dem Speichern dorthin zurück, von wo sie hierher kamen,
  // statt immer fest zu /profil zu springen.
  redirect(safeInternalPath(formData.get("next") as string | null) ?? "/profil");
}

// Wie addVehicle, aber ohne redirect — fürs Inline-Formular im
// Live-Tracking-Fazit (LiveTrackingForm): ein Redirect würde dort die
// gesamte, nur im Speicher gehaltene Aufzeichnung durch Unmounten
// zerstören. Gibt das neue Fahrzeug zurück, damit der Aufrufer es direkt in
// die lokale Fahrzeugliste übernehmen kann, ohne die Seite neu zu laden.
export async function addVehicleInline(formData: FormData): Promise<InsertVehicleResult> {
  return insertVehicleFromFormData(formData);
}

export interface DeleteVehicleState {
  error: string | null;
}

export async function deleteVehicle(vehicleId: string): Promise<DeleteVehicleState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  // Explizit auf den eigenen Nutzer filtern statt allein auf RLS zu
  // vertrauen (Defense-in-Depth — siehe app/profil/page.tsx für den gleichen
  // Grundsatz bei der Fahrzeug-Abfrage). Vorab-Check wie in completions.ts
  // (z.B. removeCompletionPhoto): ohne ihn würde ein durch RLS/den
  // user_id-Filter blockierter Löschversuch (0 betroffene Zeilen, kein
  // Supabase-Error) fälschlich als Erfolg durchgehen.
  const { data: existing } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) return { error: "Fahrzeug nicht gefunden." };

  const { error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("user_id", user.id);

  if (error) return { error: "Fahrzeug konnte nicht entfernt werden." };

  revalidatePath("/profil");
  return { error: null };
}
