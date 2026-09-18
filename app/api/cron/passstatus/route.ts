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
  // "offen" setzen. Also lieber nichts tun und den Fehler stehen lassen — die
  // Status altern dann von selbst auf "kein Stand" (lib/passStatus.ts).
  if (antwort.voll && antwort.xml.length > 0 && situationen.length === 0) {
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
  const gelieferteIds = [...new Set(situationen.map((s) => s.id))];

  const { data: vorher } = gelieferteIds.length
    ? await supabase
        .from("verkehrsmeldungen")
        .select("pass_id")
        .in("situation_id", gelieferteIds)
        .returns<{ pass_id: string }[]>()
    : { data: [] as { pass_id: string }[] };

  const betroffen = new Set<string>([
    ...(vorher ?? []).map((v) => v.pass_id),
    ...treffer.map((t) => t.passId),
  ]);

  if (antwort.voll) {
    // Vollabruf: was jetzt nicht geliefert wurde, gibt es nicht mehr. Die
    // Differenz wird hier gebildet und dann über .in() gelöscht — ein von Hand
    // zusammengesetzter "not in"-Filter müsste fremde Ids escapen, und genau
    // daran scheitert so ein Filter irgendwann still.
    const { data: gespeicherte } = await supabase
      .from("verkehrsmeldungen")
      .select("situation_id, pass_id")
      .returns<{ situation_id: string; pass_id: string }[]>();

    const geliefert = new Set(gelieferteIds);
    const verwaist = (gespeicherte ?? []).filter((z) => !geliefert.has(z.situation_id));

    if (verwaist.length > 0) {
      await supabase
        .from("verkehrsmeldungen")
        .delete()
        .in("situation_id", [...new Set(verwaist.map((z) => z.situation_id))]);
      for (const zeile of verwaist) betroffen.add(zeile.pass_id);
    }
  } else if (gelieferteIds.length) {
    await supabase.from("verkehrsmeldungen").delete().in("situation_id", gelieferteIds);
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

  // Beim Vollabruf jeden Pass neu bewerten (auch die ohne Meldung — sie sind
  // die "offen"-Fälle). Beim Delta genügen die berührten plus die, für die
  // noch Meldungen liegen: deren Gültigkeit kann inzwischen abgelaufen sein.
  const { data: offeneMeldungen } = await supabase
    .from("verkehrsmeldungen")
    .select("pass_id, zustand, text, gueltig_von, gueltig_bis")
    .returns<
      { pass_id: string; zustand: AktiveMeldung["zustand"]; text: string; gueltig_von: string | null; gueltig_bis: string | null }[]
    >();

  const meldungenJePass = new Map<string, AktiveMeldung[]>();
  for (const zeile of offeneMeldungen ?? []) {
    meldungenJePass.set(zeile.pass_id, [
      ...(meldungenJePass.get(zeile.pass_id) ?? []),
      { zustand: zeile.zustand, text: zeile.text, gueltigVon: zeile.gueltig_von, gueltigBis: zeile.gueltig_bis },
    ]);
  }

  const zuBewerten = antwort.voll
    ? paesse.map((p) => p.id)
    : [...new Set([...betroffen, ...meldungenJePass.keys()])];

  let ereignisse = 0;
  for (const passId of zuBewerten) {
    const pass = paesse.find((p) => p.id === passId);
    if (!pass) continue;

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
      continue;
    }
    if (wechsel === true) ereignisse += 1;
  }

  await supabase
    .from("feed_abgleich")
    .update({
      erfolg_am: jetzt.toISOString(),
      ...(antwort.voll ? { voll_am: jetzt.toISOString() } : {}),
      fehler: null,
      fehler_am: null,
    })
    .eq("quelle", FEED_QUELLE);

  return NextResponse.json({
    art: antwort.voll ? "voll" : "delta",
    situationen: situationen.length,
    treffer: treffer.length,
    bewertet: zuBewerten.length,
    ereignisse,
  });
}
