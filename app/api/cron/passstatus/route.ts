import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DELTA_MAX_ALTER_MS,
  FEED_QUELLE,
  holeVerkehrsmeldungen,
  istFeedKonfiguriert,
  VOLL_ABSTAND_MS,
} from "@/lib/astraFeed";
import {
  ordneMeldungZu,
  parseVerkehrsmeldungen,
  statusAusMeldungen,
  type AktiveMeldung,
  type PassMuster,
} from "@/lib/passMeldungen";
import { loeschGruppen, mitHoechstens } from "@/lib/passAbgleich";

// Abgleich der Passstatus mit den ASTRA-Verkehrsmeldungen. Läuft alle fünf
// Minuten (vercel.json).
//
// Der Ablauf in einem Satz: Meldungen holen, den Pässen zuordnen, den Bestand
// je Pass zu einem Zustand verdichten, und diesen Zustand über
// pass_status_anwenden() schreiben — die Funktion entscheidet selbst, ob
// daraus ein Ereignis für Folgende wird und ob eine Übersteuerung durch
// Moderatoren dazwischensteht (0104).
//
// Wie der Stripe-Webhook läuft dieser Handler ohne Session mit dem
// Service-Role-Client (AGENTS.md, "Supabase Rules", Muster a): es gibt keinen
// Nutzer, und die Berechtigung kommt aus CRON_SECRET.

// Obergrenze für einen Lauf. Der Abruf selbst bricht nach 20 s ab
// (ZEITLIMIT_MS in lib/astraFeed.ts), der Rest sind ein paar Dutzend kurze
// Datenbankaufrufe. Ohne eigene Grenze gälte die des Projekts (bei Vercel
// mit Fluid Compute bis zu 300 s) — ein hängender Lauf überlappte dann den
// nächsten, der fünf Minuten später startet. 60 s lassen dem normalen Lauf
// reichlich Luft und beenden einen hängenden, bevor der nächste kommt.
export const maxDuration = 60;

// Wie viele pass_status_anwenden-Aufrufe gleichzeitig laufen (siehe unten).
const GLEICHZEITIGE_PASSAUFRUFE = 6;

function istBerechtigt(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

interface PassZeile extends PassMuster {
  wintersperre_ab_monat: number | null;
  wintersperre_bis_monat: number | null;
}

export async function GET(req: Request) {
  if (!istBerechtigt(req)) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 401 });
  }

  if (!istFeedKonfiguriert()) {
    // Kein Schlüssel: kein Fehler, sondern ein Betriebszustand. Die App zeigt
    // dann "kein Stand", und Moderatoren setzen von Hand.
    return NextResponse.json({ uebersprungen: "ASTRA_API_KEY fehlt" }, { status: 200 });
  }

  const supabase = createAdminClient();
  const jetzt = new Date();

  const { data: stand } = await supabase
    .from("feed_abgleich")
    .select("voll_am, erfolg_am")
    .eq("quelle", FEED_QUELLE)
    .maybeSingle<{ voll_am: string | null; erfolg_am: string | null }>();

  const letzterErfolg = stand?.erfolg_am ? new Date(stand.erfolg_am) : null;
  const letzterVoll = stand?.voll_am ? new Date(stand.voll_am) : null;

  // Voll abholen, wenn noch nie, wenn der letzte Vollabruf alt ist, oder wenn
  // der letzte Erfolg so lange her ist, dass ein Delta Lücken liesse.
  const vollNoetig =
    !letzterVoll ||
    jetzt.getTime() - letzterVoll.getTime() > VOLL_ABSTAND_MS ||
    !letzterErfolg ||
    jetzt.getTime() - letzterErfolg.getTime() > DELTA_MAX_ALTER_MS;

  const antwort = await holeVerkehrsmeldungen(vollNoetig ? null : letzterErfolg);

  if (!antwort.ok) {
    await supabase
      .from("feed_abgleich")
      .update({ fehler_am: jetzt.toISOString(), fehler: antwort.fehler })
      .eq("quelle", FEED_QUELLE);
    console.error("Verkehrsmeldungen konnten nicht abgeholt werden", antwort.fehler);
    return NextResponse.json({ error: "Abruf fehlgeschlagen" }, { status: 502 });
  }

  const { data: paesse } = await supabase
    .from("paesse")
    .select("id, suchbegriffe, wintersperre_ab_monat, wintersperre_bis_monat")
    .returns<PassZeile[]>();

  if (!paesse || paesse.length === 0) {
    return NextResponse.json({ error: "Kein Passkatalog" }, { status: 500 });
  }

  const situationen = parseVerkehrsmeldungen(antwort.xml);
  const treffer = situationen.flatMap((situation) => ordneMeldungZu(situation, paesse));

  // Ein Vollabruf ohne eine einzige Situation heisst entweder "in der ganzen
  // Schweiz ist nichts los" oder "die Lieferung sieht anders aus als gedacht".
  // Das zweite ist wahrscheinlicher, und der Unterschied ist teuer: der
  // Abgleich würde jede gespeicherte Sperrung löschen und jeden Pass auf
  // "offen" setzen — samt Ereigniszeile, also samt falscher "ist wieder
  // offen"-Meldung an alle Folgenden und einem erfundenen Öffnungstag im
  // Protokoll, das sich nicht zurücknehmen lässt.
  //
  // Die Bedingung prüfte zuerst zusätzlich auf einen nicht leeren Rumpf und
  // liess damit ausgerechnet den leersten Fall durch. Ein leerer Rumpf und
  // eine 304 auf einen Vollabruf sind jetzt schon in lib/astraFeed.ts
  // Fehler; hier bleibt die Regel ohne Ausnahme: kein Vollabruf ohne
  // Situationen. Lieber nichts tun und den Fehler stehen lassen — die Status
  // altern dann von selbst auf "kein Stand" (lib/passStatus.ts).
  if (antwort.voll && situationen.length === 0) {
    await supabase
      .from("feed_abgleich")
      .update({ fehler_am: jetzt.toISOString(), fehler: "Vollabruf ohne Situationen — Format geprüft?" })
      .eq("quelle", FEED_QUELLE);
    console.error("Vollabruf lieferte keine Situationen", { zeichen: antwort.xml.length });
    return NextResponse.json({ error: "Leere Lieferung" }, { status: 502 });
  }

  // Jede in dieser Lieferung enthaltene Situation wird neu geschrieben: ihre
  // alten Zeilen fallen weg, die aktuellen Treffer kommen hinein. Damit sind
  // aufgehobene, geänderte und nicht mehr passende Meldungen mit einem
  // Handgriff erledigt.
  const gelieferteIds = new Set(situationen.map((s) => s.id));

  // Jeder Schreib- oder Löschfehler zählt. Mit einem Fehler darf der Lauf
  // nicht als Erfolg gestempelt werden: erfolg_am ist das, woran die
  // Oberfläche "aktueller Stand" festmacht, und ein Delta bewertet einen
  // Pass, dessen Aufhebung hier gescheitert ist, nicht noch einmal — der
  // alte "Gesperrt" stünde bis zum nächsten Vollabruf (20 h) als frisch da.
  // Ohne Stempel erzwingt der nächste Lauf nach 15 Minuten einen Vollabruf,
  // und nach 30 Minuten zeigt die App ehrlich "kein Stand".
  let schreibfehler = 0;

  // Die gespeicherten Meldungen einmal ganz lesen statt über
  // .in(gelieferteIds): ein Vollabruf liefert rund 900 Situationen, und so
  // viele Ids in einer GET-Adresse sprengen die Längengrenze des Gateways —
  // der Fehler blieb unbemerkt, und das Aufräumen fiel still aus. Die
  // Tabelle hält nur die Treffer auf Pässe und ist klein.
  const { data: gespeichert, error: lesefehler } = await supabase
    .from("verkehrsmeldungen")
    .select("situation_id, pass_id")
    .returns<{ situation_id: string; pass_id: string }[]>();
  if (lesefehler) {
    console.error("Verkehrsmeldungen konnten nicht gelesen werden", lesefehler);
    return NextResponse.json({ error: "Lesen fehlgeschlagen" }, { status: 500 });
  }

  const betroffen = new Set<string>(treffer.map((t) => t.passId));
  for (const zeile of gespeichert ?? []) {
    if (gelieferteIds.has(zeile.situation_id)) betroffen.add(zeile.pass_id);
  }

  if (treffer.length > 0) {
    const { error } = await supabase.from("verkehrsmeldungen").upsert(
      treffer.map((t) => ({
        situation_id: t.situationId,
        pass_id: t.passId,
        zustand: t.zustand,
        text: t.text,
        gueltig_von: t.gueltigVon,
        gueltig_bis: t.gueltigBis,
        version_am: t.versionAm,
      })),
      { onConflict: "situation_id,pass_id" },
    );
    if (error) {
      console.error("Verkehrsmeldungen konnten nicht gespeichert werden", error);
      return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
    }
  }

  // Erst schreiben, dann aufräumen: stünde die Sperrung zwischen Löschen und
  // Schreiben nirgends, liesse ein Fehler beim Schreiben sie ganz
  // verschwinden. Weg fällt, was zu einer gelieferten Situation gespeichert
  // ist, aber keinen Treffer mehr hat (aufgehoben, geändert, passt nicht
  // mehr) — und beim Vollabruf zusätzlich alles, was gar nicht mehr
  // geliefert wurde.
  //
  // Bis 2026-09-25 lief das Zeile für Zeile, eine DELETE-Anfrage je Meldung
  // nacheinander. Jetzt in möglichst wenigen Anweisungen (loeschGruppen in
  // lib/passAbgleich.ts: im Normalfall eine, sonst eine je Pass), die
  // untereinander parallel laufen. Die Fehlerzählung bleibt je Zeile, damit
  // "n Schreibfehler" dieselbe Grösse meint wie vorher.
  const schluessel = (situationId: string, passId: string) => JSON.stringify([situationId, passId]);
  const behalten = new Set(treffer.map((t) => schluessel(t.situationId, t.passId)));
  const wegfallend = (gespeichert ?? []).filter((zeile) => {
    if (behalten.has(schluessel(zeile.situation_id, zeile.pass_id))) return false;
    return antwort.voll || gelieferteIds.has(zeile.situation_id);
  });
  const wegfallendSchluessel = new Set(wegfallend.map((z) => schluessel(z.situation_id, z.pass_id)));
  const bleibend = [
    ...(gespeichert ?? []).filter((z) => !wegfallendSchluessel.has(schluessel(z.situation_id, z.pass_id))),
    ...treffer.map((t) => ({ situation_id: t.situationId, pass_id: t.passId })),
  ];

  const loeschErgebnisse = await Promise.all(
    loeschGruppen(wegfallend, bleibend).map(async (gruppe) => {
      const { error } = await supabase
        .from("verkehrsmeldungen")
        .delete()
        .in("situation_id", gruppe.situationIds)
        .in("pass_id", gruppe.passIds);
      return { gruppe, error };
    }),
  );
  for (const { gruppe, error } of loeschErgebnisse) {
    if (error) {
      schreibfehler += gruppe.zeilen.length;
      console.error("Verkehrsmeldungen konnten nicht gelöscht werden", gruppe.zeilen, error);
      continue;
    }
    for (const zeile of gruppe.zeilen) betroffen.add(zeile.pass_id);
  }

  // Beim Vollabruf jeden Pass neu bewerten (auch die ohne Meldung — sie sind
  // die "offen"-Fälle). Beim Delta genügen die berührten plus die, für die
  // noch Meldungen liegen: deren Gültigkeit kann inzwischen abgelaufen sein.
  const { data: offeneMeldungen, error: meldungsfehler } = await supabase
    .from("verkehrsmeldungen")
    .select("pass_id, zustand, text, gueltig_von, gueltig_bis")
    .returns<
      { pass_id: string; zustand: AktiveMeldung["zustand"]; text: string; gueltig_von: string | null; gueltig_bis: string | null }[]
    >();
  if (meldungsfehler) {
    console.error("Offene Meldungen konnten nicht gelesen werden", meldungsfehler);
    return NextResponse.json({ error: "Lesen fehlgeschlagen" }, { status: 500 });
  }

  const meldungenJePass = new Map<string, AktiveMeldung[]>();
  for (const zeile of offeneMeldungen ?? []) {
    meldungenJePass.set(zeile.pass_id, [
      ...(meldungenJePass.get(zeile.pass_id) ?? []),
      { zustand: zeile.zustand, text: zeile.text, gueltigVon: zeile.gueltig_von, gueltigBis: zeile.gueltig_bis },
    ]);
  }

  // Auch im Delta: Pässe, deren Moderator-Übersteuerung abgelaufen oder
  // freigegeben ist. Ohne sie behielten sie den Wert der Moderation bis zum
  // nächsten Vollabruf, obwohl ab dem nächsten Abgleich wieder der Feed
  // schreiben soll. Eine noch laufende Übersteuerung schützt
  // pass_status_anwenden selbst.
  const { data: uebersteuert, error: moderationsfehler } = await supabase
    .from("pass_status")
    .select("pass_id, manuell_bis")
    .eq("quelle", "moderation")
    .returns<{ pass_id: string; manuell_bis: string | null }[]>();
  if (moderationsfehler) {
    console.error("Übersteuerungen konnten nicht gelesen werden", moderationsfehler);
    return NextResponse.json({ error: "Lesen fehlgeschlagen" }, { status: 500 });
  }
  const abgelaufen = (uebersteuert ?? [])
    .filter((z) => z.manuell_bis === null || new Date(z.manuell_bis) <= jetzt)
    .map((z) => z.pass_id);

  const zuBewerten = antwort.voll
    ? paesse.map((p) => p.id)
    : [...new Set([...betroffen, ...meldungenJePass.keys(), ...abgelaufen])];

  // Je Pass ein Aufruf von pass_status_anwenden — bis 2026-09-25 alle
  // nacheinander, beim Vollabruf 34 Rundreisen am Stück. Die Aufrufe hängen
  // nicht voneinander ab: die Funktion sperrt je Pass
  // (pg_advisory_xact_lock auf 'pass_status:' || pass_id) und schreibt nur
  // Zeilen dieses einen Passes. Deshalb jetzt bis zu
  // GLEICHZEITIGE_PASSAUFRUFE parallel. Ein Fehler zählt weiterhin einzeln
  // und bricht die übrigen nicht ab.
  const ergebnisse = await mitHoechstens(zuBewerten, GLEICHZEITIGE_PASSAUFRUFE, async (passId) => {
    const pass = paesse.find((p) => p.id === passId);
    if (!pass) return "uebersprungen" as const;

    const { zustand, meldung } = statusAusMeldungen(meldungenJePass.get(passId) ?? [], {
      jetzt,
      feedGesund: true,
      wintersperreAbMonat: pass.wintersperre_ab_monat,
      wintersperreBisMonat: pass.wintersperre_bis_monat,
    });

    const { data: wechsel, error } = await supabase.rpc("pass_status_anwenden", {
      p_pass_id: passId,
      p_zustand: zustand,
      p_meldung: meldung,
      p_quelle: "feed",
      p_manuell_bis: null,
    });

    if (error) {
      console.error("Passstatus konnte nicht geschrieben werden", { passId }, error);
      return "fehler" as const;
    }
    return wechsel === true ? ("wechsel" as const) : ("gleich" as const);
  });
  schreibfehler += ergebnisse.filter((e) => e === "fehler").length;
  const ereignisse = ergebnisse.filter((e) => e === "wechsel").length;

  if (schreibfehler > 0) {
    await supabase
      .from("feed_abgleich")
      .update({ fehler_am: jetzt.toISOString(), fehler: `${schreibfehler} Schreibfehler im Abgleich` })
      .eq("quelle", FEED_QUELLE);
    return NextResponse.json({ error: "Abgleich unvollständig", schreibfehler }, { status: 500 });
  }

  const { error: stempelfehler } = await supabase
    .from("feed_abgleich")
    .update({
      erfolg_am: jetzt.toISOString(),
      ...(antwort.voll ? { voll_am: jetzt.toISOString() } : {}),
      fehler: null,
      fehler_am: null,
    })
    .eq("quelle", FEED_QUELLE);
  if (stempelfehler) console.error("Abgleich konnte nicht gestempelt werden", stempelfehler);

  return NextResponse.json({
    art: antwort.voll ? "voll" : "delta",
    situationen: situationen.length,
    treffer: treffer.length,
    bewertet: zuBewerten.length,
    ereignisse,
  });
}
