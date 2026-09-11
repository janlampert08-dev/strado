#!/usr/bin/env node
// Meldet jede Fahrt, die die Belegprüfung (lib/klassenbeleg.ts) in eine
// höhere Motorklasse gestuft hat, als der Fahrer angegeben hat — damit
// jemand nachsieht, BEVOR eine Rangliste nach Klassen filtert.
//
// WARUM DAS NÖTIG IST
//
// belegeMotorklasse() schätzt aus dem GPS-Track, welche Motorleistung eine
// Fahrt mindestens verlangt hat, und stuft die Fahrt hoch, wenn die
// deklarierte Klasse das nicht hergibt. Die Konstanten dafür (Masse,
// Stirnfläche, Rollwiderstand, Luftdichte) sind aus der Physik gerechnet,
// nicht aus Strado-Daten gewonnen. Ob sie in der Praxis halten, zeigt nur
// der echte Bestand.
//
// WARUM ES NICHT RÜCKWIRKEND GEHT
//
// Naheliegend wäre, die Prüfung über alle bestehenden Fahrten laufen zu
// lassen und die Schwellen daran zu eichen. Das geht nicht: Strado
// speichert den Track als vereinfachte Geometrie OHNE Zeitstempel (0044,
// lib/track.ts). Tempo und Beschleunigung — die beiden Grössen, aus denen
// die Schätzung besteht — lassen sich daraus nicht rekonstruieren. Wer sie
// aus dauer_sekunden gleichmässig über die Punkte verteilt, glättet genau
// die Spitzen weg, um die es geht, und misst damit nichts.
//
// Die Eichung läuft deshalb VORWÄRTS: die Belegprüfung rechnet beim
// Speichern (wo der rohe Trail noch vorliegt) und schreibt ihr Ergebnis nach
// route_completions.motorklasse_belegt. Dieses Skript liest, was dabei
// herauskam. Das heisst in der Praxis: nach dem Einspielen eine Weile
// laufen lassen, dann hier nachsehen, und erst danach die Klassenfilter
// scharf schalten.
//
// DIE ABNAHMEBEDINGUNG IST EINSEITIG
//
// Eine Hochstufung ist nur richtig, wenn sie einen physikalischen
// Widerspruch aufdeckt. Eine ehrliche Fahrt darf NIE hochgestuft werden —
// eine verpasste Falschangabe kostet einen falschen Ranglisteneintrag, eine
// falsche Hochstufung kostet das Vertrauen eines echten Fahrers. Jede hier
// gemeldete Zeile ist deshalb so lange ein Fehler, bis jemand sie am
// konkreten Fahrzeug nachvollzogen hat. Wer eine Zeile nicht erklären kann,
// senkt die Schwellen in lib/klassenbeleg.ts — er erklärt nicht die Fahrt.
//
// WAS ES TUT
//
// Liest und berichtet. Es schreibt nichts, und es gibt bewusst keinen
// Schalter dafür: motorklasse_belegt wird ausschliesslich beim Speichern
// einer Fahrt gesetzt, und motorklasse_gewertet ist eine generierte Spalte,
// die sich gar nicht schreiben lässt (0080).
//
// AUFRUF
//
//   SUPABASE_URL=https://<projekt>.supabase.co \
//   SUPABASE_SECRET_KEY=<service-role-key> \
//   node scripts/motorklassen-kalibrierung.mjs [--limit 1000]
//
// Der Service-Role-Key ist nötig, weil das Skript fremde Fahrten und fremde
// Fahrzeuge lesen muss — unter RLS sieht jede Rolle nur die eigenen. Er
// gehört in die Umgebung des Aufrufs, nicht in eine Datei und nicht in die
// Shell-History; siehe SECURITY.md.
//
// Beendet sich mit Code 2, wenn es Hochstufungen gibt (damit ein CI- oder
// Cron-Aufruf darauf reagieren kann), sonst mit 0.
//
// STATUS: Dieses Skript wurde noch nie ausgeführt — es braucht den
// Service-Role-Key und ein Live-Projekt, und beides lag beim Schreiben
// nicht vor. Der erste Lauf ist ein Arbeitsschritt, kein Formalakt.

import { createClient } from "@supabase/supabase-js";

// Kurzformen nur für die Ausgabe. Die massgebliche Liste steht in
// lib/motorklassen.ts (und in public.motorklasse(), 0080) — hier bewusst
// als schlichte Abbildung dupliziert, damit dieses Skript ohne
// TypeScript-Auflösung auskommt.
const LABEL = {
  moto_a1: "A1",
  moto_a35: "A 35 kW",
  moto_a: "A offen",
  auto_bis110: "bis 150 PS",
  auto_bis220: "150–300 PS",
  auto_ueber220: "über 300 PS",
};

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL und SUPABASE_SECRET_KEY müssen gesetzt sein.");
  process.exit(1);
}

const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex === -1 ? 1000 : Number(process.argv[limitIndex + 1]);
if (!Number.isInteger(limit) || limit <= 0) {
  console.error("--limit braucht eine positive ganze Zahl.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: fahrten, error } = await supabase
  .from("route_completions")
  .select(
    "id, datum, distanz_km, dauer_sekunden, motorklasse, motorklasse_belegt, motorklasse_gewertet, vehicles(typ, marke, modell, hubraum_ccm, leistung_kw)",
  )
  .not("motorklasse", "is", null)
  .order("datum", { ascending: false })
  .limit(limit);

if (error) {
  console.error("Abfrage fehlgeschlagen:", error.message);
  process.exit(1);
}

const mitBeleg = fahrten.filter((f) => f.motorklasse_belegt !== null);
const hochgestuft = fahrten.filter(
  (f) => f.motorklasse_gewertet !== null && f.motorklasse_gewertet !== f.motorklasse,
);

console.log(
  `${fahrten.length} Fahrten mit Klasse geprüft, davon ${mitBeleg.length} mit Belegwert.\n` +
    "Fahrten ohne Belegwert stammen entweder von vor dieser Prüfung oder waren\n" +
    "zu kurz für ein Urteil — beides ist der Normalfall und kein Fehler.\n",
);

if (hochgestuft.length === 0) {
  console.log("Keine Fahrt wurde hochgestuft. Die Schwellen halten für diesen Bestand.");
  process.exit(0);
}

console.log(`${hochgestuft.length} Fahrt(en) hochgestuft — jede davon ist zu erklären:\n`);
for (const f of hochgestuft) {
  const v = f.vehicles ?? {};
  const kmh =
    f.distanz_km && f.dauer_sekunden ? (f.distanz_km / (f.dauer_sekunden / 3600)).toFixed(0) : "?";
  console.log(
    `  ${f.datum}  ${f.id}\n` +
      `    Fahrzeug:   ${v.marke ?? "?"} ${v.modell ?? "?"} ` +
      `(${v.typ ?? "?"}, ${v.leistung_kw ?? "?"} kW, ${v.hubraum_ccm ?? "?"} cm³)\n` +
      `    Fahrt:      ${f.distanz_km ?? "?"} km, Schnitt ${kmh} km/h\n` +
      `    angegeben:  ${LABEL[f.motorklasse] ?? f.motorklasse}\n` +
      `    gewertet:   ${LABEL[f.motorklasse_gewertet] ?? f.motorklasse_gewertet}\n`,
  );
}

console.log(
  "Lässt sich eine dieser Zeilen nicht am konkreten Fahrzeug nachvollziehen,\n" +
    "sind die Schwellen in lib/klassenbeleg.ts zu scharf und gehören gesenkt —\n" +
    "nicht die Fahrt erklärt.",
);
process.exit(2);
