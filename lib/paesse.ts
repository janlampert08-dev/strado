// Abfragen rund um Pässe: Katalog, Status, Kalender, Sammlung.
//
// Serverseitig (lib/supabase/server). Die reinen Teile liegen daneben:
// lib/passStatus.ts (Anzeige), lib/passKalender.ts (Saison und Sperrtage),
// lib/passMeldungen.ts (Deutung der Verkehrsmeldungen).
import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { FEED_QUELLE } from "@/lib/astraFeed";
import type { PassZustand } from "@/lib/passMeldungen";
import { schwerwiegendster } from "@/lib/passStatus";
import type { PassEreignis, Sperrtag, SperrtagArt } from "@/lib/passKalender";

export interface Pass {
  id: string;
  name: string;
  hoeheM: number;
  kantone: string[];
  wintersperreAbMonat: number | null;
  wintersperreBisMonat: number | null;
}

export interface PassStatusZeile {
  zustand: PassZustand;
  meldung: string | null;
  quelle: "feed" | "moderation";
  seit: string;
  manuellBis: string | null;
  aktualisiertAm: string;
}

/** Ab hier gilt ein Pass als hochalpin. Die Grenze ist gesetzt, nicht
 *  gemessen — 2000 Meter ist die Marke, an der Passfahrer selbst rechnen. */
export const HOCHALPIN_AB_M = 2000;

const PASS_SPALTEN = "id, name, hoehe_m, kantone, wintersperre_ab_monat, wintersperre_bis_monat";

interface PassRoh {
  id: string;
  name: string;
  hoehe_m: number;
  kantone: string[];
  wintersperre_ab_monat: number | null;
  wintersperre_bis_monat: number | null;
}

function alsPass(zeile: PassRoh): Pass {
  return {
    id: zeile.id,
    name: zeile.name,
    hoeheM: zeile.hoehe_m,
    kantone: zeile.kantone,
    wintersperreAbMonat: zeile.wintersperre_ab_monat,
    wintersperreBisMonat: zeile.wintersperre_bis_monat,
  };
}

interface StatusRoh {
  pass_id: string;
  zustand: PassZustand;
  meldung: string | null;
  quelle: "feed" | "moderation";
  seit: string;
  manuell_bis: string | null;
  aktualisiert_am: string;
}

function alsStatus(zeile: StatusRoh): PassStatusZeile {
  return {
    zustand: zeile.zustand,
    meldung: zeile.meldung,
    quelle: zeile.quelle,
    seit: zeile.seit,
    manuellBis: zeile.manuell_bis,
    aktualisiertAm: zeile.aktualisiert_am,
  };
}

/** Wann der Feed zuletzt erfolgreich lief — entscheidet, ob ein Status aus
 *  dem Feed noch etwas behaupten darf (lib/passStatus.ts). */
export const getFeedStand = cache(async function getFeedStand(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("feed_abgleich")
    .select("erfolg_am")
    .eq("quelle", FEED_QUELLE)
    .maybeSingle<{ erfolg_am: string | null }>();
  return data?.erfolg_am ?? null;
});

export interface PassMitStatus {
  pass: Pass;
  status: PassStatusZeile | null;
  /** Die sichtbare Strecke, über die man den Pass fährt — null, solange es
   *  keine gibt. Genau diese Lücke ist der Aufruf, eine anzulegen. */
  strecke: { id: string; name: string } | null;
  /** Aus den eigenen Fahrten: wann zum ersten Mal, wie oft. */
  gefahren: { erstmals: string; fahrten: number } | null;
}

/**
 * Der ganze Katalog mit Status, zugehöriger Strecke und eigenen Stempeln.
 * Eine Abfrage je Quelle statt einer je Pass — 34 Pässe sind eine Seite, kein
 * Wasserfall.
 */
export async function getPaesseMitStatus(): Promise<PassMitStatus[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [katalog, status, verknuepfungen, sammlung] = await Promise.all([
    supabase.from("paesse").select(PASS_SPALTEN).order("hoehe_m", { ascending: false }),
    supabase.from("pass_status").select("*"),
    supabase.from("strecken_paesse").select("route_id, pass_id"),
    user
      ? supabase.rpc("meine_paesse")
      : Promise.resolve({ data: [] as { pass_id: string; erstmals: string; fahrten: number }[] }),
  ]);

  const paesse = ((katalog.data as PassRoh[] | null) ?? []).map(alsPass);
  const statusJePass = new Map(
    ((status.data as StatusRoh[] | null) ?? []).map((s) => [s.pass_id, alsStatus(s)]),
  );
  const sammlungJePass = new Map(
    ((sammlung.data as { pass_id: string; erstmals: string; fahrten: number }[] | null) ?? []).map(
      (s) => [s.pass_id, { erstmals: s.erstmals, fahrten: s.fahrten }],
    ),
  );

  // strecken_paesse zeigt dem Aufrufer auch eigene private und noch nicht
  // freigegebene Strecken (security_invoker). Auf der Passliste ist aber die
  // öffentliche gemeint — sonst verlinkt die Seite für ihre Besitzerin
  // etwas, das sonst niemand sieht.
  const streckenIds = [
    ...new Set((((verknuepfungen.data as { route_id: string; pass_id: string }[] | null) ?? [])).map((v) => v.route_id)),
  ];
  const { data: strecken } = streckenIds.length
    ? await supabase
        .from("routes")
        .select("id, name")
        .in("id", streckenIds)
        .eq("status_ok", true)
        .eq("ist_privat", false)
        .order("name")
    : { data: [] as { id: string; name: string }[] };

  const streckeNachId = new Map(((strecken as { id: string; name: string }[] | null) ?? []).map((s) => [s.id, s]));
  const streckeJePass = new Map<string, { id: string; name: string }>();
  for (const verknuepfung of ((verknuepfungen.data as { route_id: string; pass_id: string }[] | null) ?? [])) {
    if (streckeJePass.has(verknuepfung.pass_id)) continue;
    const strecke = streckeNachId.get(verknuepfung.route_id);
    if (strecke) streckeJePass.set(verknuepfung.pass_id, strecke);
  }

  return paesse.map((pass) => ({
    pass,
    status: statusJePass.get(pass.id) ?? null,
    strecke: streckeJePass.get(pass.id) ?? null,
    gefahren: sammlungJePass.get(pass.id) ?? null,
  }));
}

export interface PassKontext {
  pass: Pass;
  status: PassStatusZeile | null;
  ereignisse: PassEreignis[];
  sperrtage: Sperrtag[];
  folgtMan: boolean;
}

/**
 * Alles, was die Streckenseite über die Pässe dieser Strecke zeigt. Leer für
 * jede Strecke, die über keinen Pass des Katalogs führt — die allermeisten
 * Strecken sind keine Passstrassen, und dann fehlt der Abschnitt einfach.
 */
export const getPassKontextFuerStrecke = cache(async function getPassKontextFuerStrecke(
  routeId: string,
): Promise<PassKontext[]> {
  const supabase = await createClient();

  const { data: verknuepfungen } = await supabase
    .from("strecken_paesse")
    .select("pass_id")
    .eq("route_id", routeId)
    .returns<{ pass_id: string }[]>();

  const passIds = (verknuepfungen ?? []).map((v) => v.pass_id);
  if (passIds.length === 0) return [];

  const user = await getCurrentUser();

  const [katalog, status, ereignisse, sperrtage, folgen] = await Promise.all([
    supabase.from("paesse").select(PASS_SPALTEN).in("id", passIds),
    supabase.from("pass_status").select("*").in("pass_id", passIds),
    supabase
      .from("pass_ereignisse")
      .select("pass_id, zustand, vorher, erfasst_am")
      .in("pass_id", passIds)
      .order("erfasst_am", { ascending: false })
      .limit(60),
    supabase
      .from("pass_sperrtage")
      .select("id, pass_id, von, bis, art, titel, zeitfenster, quelle_url")
      .in("pass_id", passIds)
      .order("von"),
    user
      ? supabase.from("pass_folgen").select("pass_id").in("pass_id", passIds)
      : Promise.resolve({ data: [] as { pass_id: string }[] }),
  ]);

  const statusJePass = new Map(
    ((status.data as StatusRoh[] | null) ?? []).map((s) => [s.pass_id, alsStatus(s)]),
  );
  const gefolgt = new Set(((folgen.data as { pass_id: string }[] | null) ?? []).map((f) => f.pass_id));

  type EreignisRoh = { pass_id: string; zustand: PassEreignis["zustand"]; vorher: PassEreignis["vorher"]; erfasst_am: string };
  type SperrtagRoh = {
    id: string; pass_id: string; von: string; bis: string;
    art: SperrtagArt; titel: string; zeitfenster: string | null; quelle_url: string | null;
  };

  return ((katalog.data as PassRoh[] | null) ?? []).map(alsPass).map((pass) => ({
    pass,
    status: statusJePass.get(pass.id) ?? null,
    ereignisse: (((ereignisse.data as EreignisRoh[] | null) ?? [])
      .filter((e) => e.pass_id === pass.id)
      .map((e) => ({ zustand: e.zustand, vorher: e.vorher, erfasstAm: e.erfasst_am }))),
    sperrtage: (((sperrtage.data as SperrtagRoh[] | null) ?? [])
      .filter((s) => s.pass_id === pass.id)
      .map((s) => ({
        id: s.id,
        passId: s.pass_id,
        von: s.von,
        bis: s.bis,
        art: s.art,
        titel: s.titel,
        zeitfenster: s.zeitfenster,
        quelleUrl: s.quelle_url,
      }))),
    folgtMan: gefolgt.has(pass.id),
  }));
});

/**
 * Für Listen: je Strecke der schwerwiegendste Passzustand — aber nur für die
 * übergebenen Strecken und in einer Abfrage.
 */
export async function getPassZustaendeJeStrecke(
  routeIds: string[],
): Promise<Map<string, PassZustand>> {
  if (routeIds.length === 0) return new Map();
  const supabase = await createClient();

  const { data: verknuepfungen } = await supabase
    .from("strecken_paesse")
    .select("route_id, pass_id")
    .in("route_id", routeIds)
    .returns<{ route_id: string; pass_id: string }[]>();

  if (!verknuepfungen || verknuepfungen.length === 0) return new Map();

  const { data: status } = await supabase
    .from("pass_status")
    .select("pass_id, zustand")
    .in("pass_id", [...new Set(verknuepfungen.map((v) => v.pass_id))])
    .returns<{ pass_id: string; zustand: PassZustand }[]>();

  const zustandJePass = new Map((status ?? []).map((s) => [s.pass_id, s.zustand]));
  const jeStrecke = new Map<string, PassZustand[]>();
  for (const verknuepfung of verknuepfungen) {
    const zustand = zustandJePass.get(verknuepfung.pass_id);
    if (!zustand) continue;
    jeStrecke.set(verknuepfung.route_id, [...(jeStrecke.get(verknuepfung.route_id) ?? []), zustand]);
  }

  const ergebnis = new Map<string, PassZustand>();
  for (const [routeId, zustaende] of jeStrecke) {
    const schlimmster = schwerwiegendster(zustaende);
    if (schlimmster) ergebnis.set(routeId, schlimmster);
  }
  return ergebnis;
}

export interface SammlungsStand {
  befahren: number;
  gesamt: number;
  hochalpinBefahren: number;
  hochalpinGesamt: number;
}

/** Die Kurzfassung der Sammlung für das Profil. */
export async function getSammlungsStand(): Promise<SammlungsStand | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const [{ data: katalog }, { data: meine }] = await Promise.all([
    supabase.from("paesse").select("id, hoehe_m").returns<{ id: string; hoehe_m: number }[]>(),
    supabase.rpc("meine_paesse"),
  ]);

  const hoeheJePass = new Map((katalog ?? []).map((p) => [p.id, p.hoehe_m]));
  const befahreneIds = ((meine as { pass_id: string }[] | null) ?? []).map((m) => m.pass_id);

  return {
    befahren: befahreneIds.length,
    gesamt: katalog?.length ?? 0,
    hochalpinBefahren: befahreneIds.filter((id: string) => (hoeheJePass.get(id) ?? 0) >= HOCHALPIN_AB_M).length,
    hochalpinGesamt: (katalog ?? []).filter((p) => p.hoehe_m >= HOCHALPIN_AB_M).length,
  };
}

export interface ModerationsDaten {
  paesse: { id: string; name: string; status: PassStatusZeile | null }[];
  sperrtage: (Sperrtag & { passName: string })[];
  feedStand: string | null;
}

/**
 * Was die Moderationsseite über die Pässe braucht: alle Pässe mit Status (für
 * die Auswahl und die Auffälligen-Liste) und die kommenden Sperrungen.
 *
 * Die Berechtigung hängt an der Seite und an den Server Actions, nicht hier —
 * diese Abfrage liest nur öffentlich Lesbares.
 */
export async function getPassModerationsDaten(): Promise<ModerationsDaten> {
  const supabase = await createClient();
  const heute = new Date().toISOString().slice(0, 10);

  const [katalog, status, sperrtage, feedStand] = await Promise.all([
    supabase.from("paesse").select(PASS_SPALTEN).order("name"),
    supabase.from("pass_status").select("*"),
    supabase
      .from("pass_sperrtage")
      .select("id, pass_id, von, bis, art, titel, zeitfenster, quelle_url")
      .gte("bis", heute)
      .order("von")
      .limit(50),
    getFeedStand(),
  ]);

  const paesse = ((katalog.data as PassRoh[] | null) ?? []).map(alsPass);
  const nameJePass = new Map(paesse.map((p) => [p.id, p.name]));
  const statusJePass = new Map(
    ((status.data as StatusRoh[] | null) ?? []).map((s) => [s.pass_id, alsStatus(s)]),
  );

  type SperrtagRoh = {
    id: string; pass_id: string; von: string; bis: string;
    art: SperrtagArt; titel: string; zeitfenster: string | null; quelle_url: string | null;
  };

  return {
    paesse: paesse.map((pass) => ({
      id: pass.id,
      name: pass.name,
      status: statusJePass.get(pass.id) ?? null,
    })),
    sperrtage: ((sperrtage.data as SperrtagRoh[] | null) ?? []).map((s) => ({
      id: s.id,
      passId: s.pass_id,
      passName: nameJePass.get(s.pass_id) ?? s.pass_id,
      von: s.von,
      bis: s.bis,
      art: s.art,
      titel: s.titel,
      zeitfenster: s.zeitfenster,
      quelleUrl: s.quelle_url,
    })),
    feedStand,
  };
}
