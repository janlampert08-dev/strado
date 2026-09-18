import { createClient } from "@/lib/supabase/server";
import { throwOnQueryError } from "@/lib/queryError";
import { todayInZurich } from "@/lib/format";
import {
  kurzhinweis,
  mfkErinnerung,
  schaetzeKmStand,
  serviceErinnerung,
  sortiereNeuesteZuerst,
  type FahrtFuerBerechnung,
  type KmSchaetzung,
  type MfkErinnerung,
  type ServiceErinnerung,
  type WartungsStatus,
} from "@/lib/wartung";
import type { Wartungseintrag, Wartungserinnerung } from "@/types/database";

// Die Abfragen zum Wartungsheft. Getrennt von lib/wartung.ts, weil das
// Rechenmodul vom Formular (Client Component) importiert wird und nichts
// aus lib/supabase/** sehen darf.
//
// Alle Abfragen filtern zusätzlich auf die user_id aus getUser(), obwohl
// die RLS-Policies dasselbe tun (Defense-in-Depth, wie die
// Fahrzeug-Abfrage in app/profil/page.tsx). Ein Fehler in einer Abfrage
// wird geworfen statt als leeres Heft ausgegeben (lib/queryError.ts):
// "keine Einträge" ist eine Tatsachenbehauptung, die ein Ausfall nicht
// aufstellen darf — hier zählt sie besonders, weil aus ihr eine
// Fälligkeit abgeleitet wird.

/**
 * Fahrten, die als Kilometer eines Fahrzeugs zählen dürfen.
 *
 * parent_completion_id is null ist der Punkt: ein automatisch erkannter
 * Streckenabschnitt (0050) liegt INNERHALB einer freien Fahrt, die ihre
 * Kilometer schon trägt. Beide zu zählen würde die Strecke doppelt
 * addieren — und aus einer Untergrenze eine Übertreibung machen, was die
 * ganze Rechnung in lib/wartung.ts umdrehen würde.
 */
async function ladeFahrten(userId: string, fahrzeugId: string): Promise<FahrtFuerBerechnung[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_completions")
    .select("datum, distanz_km")
    .eq("user_id", userId)
    .eq("fahrzeug_id", fahrzeugId)
    .is("parent_completion_id", null)
    .returns<FahrtFuerBerechnung[]>();
  throwOnQueryError(error, "Fahrten für das Wartungsheft");
  return data ?? [];
}

export interface WartungsheftDaten {
  eintraege: Wartungseintrag[];
  erinnerungen: Wartungserinnerung | null;
  schaetzung: KmSchaetzung | null;
  mfk: MfkErinnerung;
  service: ServiceErinnerung;
  /** Aufgezeichnete Kilometer dieses Fahrzeugs insgesamt. */
  aufgezeichnetKmTotal: number;
}

/** Alles, was die Fahrzeug-Detailseite über ein Fahrzeug wissen muss. */
export async function getWartungsheft(userId: string, fahrzeugId: string): Promise<WartungsheftDaten> {
  const supabase = await createClient();
  const [eintraegeResult, erinnerungenResult, fahrten] = await Promise.all([
    supabase
      .from("wartungseintraege")
      .select("id, fahrzeug_id, user_id, art, datum, km_stand, kosten_chf, notiz, created_at")
      .eq("user_id", userId)
      .eq("fahrzeug_id", fahrzeugId)
      .order("datum", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<Wartungseintrag[]>(),
    supabase
      .from("wartungserinnerungen")
      .select("fahrzeug_id, user_id, naechste_mfk_am, service_intervall_km, service_intervall_monate, created_at")
      .eq("user_id", userId)
      .eq("fahrzeug_id", fahrzeugId)
      .maybeSingle<Wartungserinnerung>(),
    ladeFahrten(userId, fahrzeugId),
  ]);

  throwOnQueryError(eintraegeResult.error, "Wartungsheft");
  throwOnQueryError(erinnerungenResult.error, "Wartungserinnerungen");

  const eintraege = sortiereNeuesteZuerst(eintraegeResult.data ?? []);
  const erinnerungen = erinnerungenResult.data ?? null;
  const heute = todayInZurich();

  return {
    eintraege,
    erinnerungen,
    schaetzung: schaetzeKmStand(eintraege, fahrten),
    mfk: mfkErinnerung(erinnerungen, eintraege, heute),
    service: serviceErinnerung(erinnerungen, eintraege, fahrten, heute),
    aufgezeichnetKmTotal: Math.round(
      fahrten.reduce((summe, f) => summe + (f.distanz_km && f.distanz_km > 0 ? f.distanz_km : 0), 0),
    ),
  };
}

/**
 * Für die Fahrzeugkacheln im Profil: pro Fahrzeug höchstens eine kurze
 * Zeile, und nur, wenn etwas bald, fällig oder überfällig ist.
 *
 * Drei Abfragen für alle Fahrzeuge zusammen statt drei pro Fahrzeug —
 * die Profilseite lädt ohnehin schon sechs Abfragen parallel.
 */
// Alle Fahrten mit Fahrzeug, seitenweise. PostgREST liefert je Anfrage
// höchstens rund 1000 Zeilen; ohne Blättern zählte eine Vielfahrerin zu
// wenige Kilometer, und die Service-Erinnerung käme zu spät.
const SEITE = 1000;
type FahrtMitFahrzeug = { fahrzeug_id: string; datum: string; distanz_km: number | null };
async function alleFahrtenMitFahrzeug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<FahrtMitFahrzeug[]> {
  const alle: FahrtMitFahrzeug[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await supabase
      .from("route_completions")
      .select("id, fahrzeug_id, datum, distanz_km")
      .eq("user_id", userId)
      .not("fahrzeug_id", "is", null)
      .is("parent_completion_id", null)
      .order("id")
      .range(von, von + SEITE - 1)
      .returns<(FahrtMitFahrzeug & { id: string })[]>();
    throwOnQueryError(error, "Fahrten für das Wartungsheft");
    for (const { fahrzeug_id, datum, distanz_km } of data ?? []) alle.push({ fahrzeug_id, datum, distanz_km });
    if ((data ?? []).length < SEITE) return alle;
  }
}

export async function getWartungsHinweise(
  userId: string,
): Promise<Record<string, { text: string; status: WartungsStatus }>> {
  const supabase = await createClient();
  const [eintraegeResult, erinnerungenResult, alleFahrten] = await Promise.all([
    supabase
      .from("wartungseintraege")
      .select("fahrzeug_id, art, datum, km_stand, created_at")
      .eq("user_id", userId)
      .returns<
        { fahrzeug_id: string; art: Wartungseintrag["art"]; datum: string; km_stand: number | null; created_at: string }[]
      >(),
    supabase
      .from("wartungserinnerungen")
      .select("fahrzeug_id, user_id, naechste_mfk_am, service_intervall_km, service_intervall_monate, created_at")
      .eq("user_id", userId)
      .returns<Wartungserinnerung[]>(),
    alleFahrtenMitFahrzeug(supabase, userId),
  ]);

  throwOnQueryError(eintraegeResult.error, "Wartungsheft");
  throwOnQueryError(erinnerungenResult.error, "Wartungserinnerungen");

  const heute = todayInZurich();
  const hinweise: Record<string, { text: string; status: WartungsStatus }> = {};

  // Nur Fahrzeuge mit Einstellungen können überhaupt etwas melden — ohne
  // Termin und ohne Intervall gibt es keine Fälligkeit.
  for (const erinnerung of erinnerungenResult.data ?? []) {
    const eintraege = (eintraegeResult.data ?? []).filter((e) => e.fahrzeug_id === erinnerung.fahrzeug_id);
    const fahrten = alleFahrten.filter((f) => f.fahrzeug_id === erinnerung.fahrzeug_id);
    const hinweis = kurzhinweis(
      mfkErinnerung(erinnerung, eintraege, heute),
      serviceErinnerung(erinnerung, eintraege, fahrten, heute),
    );
    if (hinweis) hinweise[erinnerung.fahrzeug_id] = hinweis;
  }

  return hinweise;
}
