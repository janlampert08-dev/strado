import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  abfrageZeitpunkte,
  fahrzeitFuer,
  faktorenAusDauern,
  laengeKm,
  streckeGesperrt,
  type ProfilPunkt,
} from "@/lib/verkehrsprofil";
import type { GeoLineString } from "@/types/database";

// Rechnet das Verkehrsprofil einzelner Strecken neu (siehe 0105). Läuft
// nachts (vercel.json).
//
// Bewusst wenige Strecken je Lauf: eine Strecke sind sieben Tage mal vierzehn
// Stunden, also 98 Anfragen an die Directions-API. Drei Strecken je Nacht
// halten das Kontingent klein und das Profil trotzdem aktuell — der Bestand
// wächst langsamer, als der Cron ihn abarbeitet.
const STRECKEN_JE_LAUF = 3;
const PROFIL_ALTERT_NACH_TAGEN = 21;
// Gleichzeitige Anfragen an Mapbox. Genug, damit ein Lauf in Sekunden statt
// Minuten fertig ist, wenig genug für das Ratenlimit.
const GLEICHZEITIG = 4;

function istBerechtigt(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function inHaeppchen<T, R>(
  eingaben: T[],
  groesse: number,
  arbeit: (eingabe: T) => Promise<R>,
): Promise<R[]> {
  const ergebnisse: R[] = [];
  for (let i = 0; i < eingaben.length; i += groesse) {
    ergebnisse.push(...(await Promise.all(eingaben.slice(i, i + groesse).map(arbeit))));
  }
  return ergebnisse;
}

export async function GET(req: Request) {
  if (!istBerechtigt(req)) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 401 });
  }

  if (!process.env.MAPBOX_SERVER_TOKEN && !process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return NextResponse.json({ uebersprungen: "Kein Mapbox-Token" }, { status: 200 });
  }

  const supabase = createAdminClient();
  const jetzt = new Date();
  const grenze = new Date(jetzt.getTime() - PROFIL_ALTERT_NACH_TAGEN * 24 * 60 * 60 * 1000);

  const [{ data: strecken }, { data: staende }, { data: passZuordnung }, { data: passStatus }] = await Promise.all([
    supabase
      .from("routes_geojson")
      .select("id, name, geometry_geojson")
      .eq("status_ok", true)
      .eq("ist_privat", false)
      .returns<{ id: string; name: string; geometry_geojson: GeoLineString }[]>(),
    supabase
      .from("strecken_verkehr_stand")
      .select("route_id, berechnet_am")
      .returns<{ route_id: string; berechnet_am: string }[]>(),
    // Welche Strecke über welchen Pass führt und ob er offen ist (0104).
    supabase
      .from("strecken_paesse")
      .select("route_id, pass_id")
      .returns<{ route_id: string; pass_id: string }[]>(),
    supabase
      .from("pass_status")
      .select("pass_id, zustand")
      .returns<{ pass_id: string; zustand: string }[]>(),
  ]);

  if (!strecken || strecken.length === 0) {
    return NextResponse.json({ berechnet: 0, offen: 0 });
  }

  const standJeStrecke = new Map((staende ?? []).map((s) => [s.route_id, s.berechnet_am]));
  const zustandJePass = new Map((passStatus ?? []).map((p) => [p.pass_id, p.zustand]));
  const paesseJeStrecke = new Map<string, string[]>();
  for (const { route_id, pass_id } of passZuordnung ?? []) {
    paesseJeStrecke.set(route_id, [...(paesseJeStrecke.get(route_id) ?? []), pass_id]);
  }

  // Nie berechnete zuerst, danach die ältesten.
  // Gesperrte Pässe werden übersprungen, nicht als "fällig" gezählt: ihr
  // Profil aus der offenen Zeit bleibt stehen (siehe GESPERRTE_ZUSTAENDE), und
  // sie belegen keinen der drei Plätze je Lauf, bis der Pass wieder offen ist.
  const faellig = strecken
    .filter((s) => !streckeGesperrt(paesseJeStrecke.get(s.id) ?? [], zustandJePass))
    .filter((s) => {
      const stand = standJeStrecke.get(s.id);
      return !stand || new Date(stand) < grenze;
    })
    .sort((a, b) => {
      const standA = standJeStrecke.get(a.id);
      const standB = standJeStrecke.get(b.id);
      if (!standA && !standB) return a.name.localeCompare(b.name);
      if (!standA) return -1;
      if (!standB) return 1;
      return standA.localeCompare(standB);
    });

  const dran = faellig.slice(0, STRECKEN_JE_LAUF);
  let berechnet = 0;

  for (const strecke of dran) {
    const koordinaten = strecke.geometry_geojson.coordinates as [number, number][];
    if (koordinaten.length < 2) continue;

    const zeitpunkte = abfrageZeitpunkte(jetzt);
    const erwartetKm = laengeKm(koordinaten);
    const punkte = await inHaeppchen(zeitpunkte, GLEICHZEITIG, async (z): Promise<ProfilPunkt> => ({
      wochentag: z.wochentag,
      stunde: z.stunde,
      dauerSekunden: (await fahrzeitFuer(koordinaten, z.abfahrtLokal, erwartetKm)) ?? 0,
    }));

    const ergebnis = faktorenAusDauern(punkte);
    // Weniger als die Hälfte beantwortet: lieber das alte Profil stehen lassen
    // als ein halbes schreiben, dessen ruhigste Stunde eine Lücke ist.
    if (!ergebnis || ergebnis.faktoren.length < zeitpunkte.length / 2) {
      console.error("Verkehrsprofil unvollständig", {
        strecke: strecke.id,
        gemessen: ergebnis?.faktoren.length ?? 0,
        erwartet: zeitpunkte.length,
      });
      continue;
    }

    const { error: loeschFehler } = await supabase
      .from("strecken_verkehr")
      .delete()
      .eq("route_id", strecke.id);
    if (loeschFehler) {
      console.error("Altes Verkehrsprofil konnte nicht entfernt werden", { strecke: strecke.id }, loeschFehler);
      continue;
    }

    const { error: schreibFehler } = await supabase.from("strecken_verkehr").insert(
      ergebnis.faktoren.map((f) => ({
        route_id: strecke.id,
        wochentag: f.wochentag,
        stunde: f.stunde,
        faktor: f.faktor,
      })),
    );

    if (schreibFehler) {
      console.error("Verkehrsprofil konnte nicht gespeichert werden", { strecke: strecke.id }, schreibFehler);
      continue;
    }

    await supabase.from("strecken_verkehr_stand").upsert(
      {
        route_id: strecke.id,
        berechnet_am: jetzt.toISOString(),
        basis_sekunden: ergebnis.basisSekunden,
      },
      { onConflict: "route_id" },
    );

    berechnet += 1;
  }

  return NextResponse.json({ berechnet, offen: Math.max(0, faellig.length - berechnet) });
}
