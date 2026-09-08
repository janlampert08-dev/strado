#!/usr/bin/env node
// Findet — und auf Wunsch löscht — Dateien im avatars-Bucket, auf die kein
// Profil mehr zeigt.
//
// WARUM DAS NÖTIG IST
//
// Der avatars-Bucket ist öffentlich (0015_profil_sichtbarkeit_avatar.sql).
// Der Schlüssel einer Datei ist "{user_id}/avatar.{endung}", und die
// Nutzer-ID steht in jeder /fahrer/[id]-URL. Wer die vier möglichen
// Endungen durchprobiert, kommt also an jedes Bild, das dort liegt — ganz
// unabhängig davon, ob noch ein Profil darauf zeigt.
//
// Zwei Wege haben solche Dateien entstehen lassen:
//
//   1. Ein Bild ersetzen. uploadAvatar() schreibt mit upsert: true, das
//      trifft aber nur den Schlüssel mit derselben Endung. Wer ein JPG
//      durch ein PNG ersetzte, legte avatar.png daneben und liess
//      avatar.jpg liegen.
//   2. Ein Konto löschen. anonymize_account() nullt profiles.avatar_url,
//      die Datei selbst blieb unberührt.
//
// Beide Wege sind in lib/actions/profile.ts bzw. lib/actions/auth.ts
// geschlossen — aber nur nach vorn. Was vorher entstanden ist, liegt noch
// da, und genau dafür ist dieses Skript da.
//
// WAS ES TUT
//
// Listet alle Objekte im Bucket, liest alle profiles.avatar_url, und
// meldet jedes Objekt, dessen Pfad in keiner avatar_url vorkommt.
// Standardmässig wird NUR berichtet. Gelöscht wird erst mit --loeschen.
//
// AUFRUF
//
//   SUPABASE_URL=https://<projekt>.supabase.co \
//   SUPABASE_SECRET_KEY=<service-role-key> \
//   node scripts/verwaiste-avatare.mjs [--loeschen]
//
// Der Service-Role-Key ist nötig, weil das Skript profiles vollständig
// lesen und im Bucket löschen muss — beides geht unter RLS bzw. den
// Storage-Policies aus 0015 nur für die eigene Zeile. Er gehört in die
// Umgebung des Aufrufs, nicht in eine Datei und nicht in die
// Shell-History; siehe SECURITY.md.
//
// Das Skript ist idempotent: ein zweiter Lauf findet nichts mehr.
//
// NICHT AUSGEFÜHRT. Es hat in dieser Form noch nie gegen eine echte
// Datenbank gelaufen. Erst mit --dry-run-Ausgabe prüfen, ob die Liste
// plausibel ist (ein Konto ohne Profilbild hat schlicht keine Datei), und
// vom Bucket ein Backup ziehen, bevor --loeschen drankommt.

import { createClient } from "@supabase/supabase-js";

const BUCKET = "avatars";
// Muss zu BILD_ENDUNGEN in lib/validation.ts passen. Wird hier nur für die
// Plausibilitätsmeldung am Ende gebraucht, nicht für die Entscheidung —
// die trifft allein der Abgleich gegen profiles.avatar_url.
const BEKANNTE_ENDUNGEN = ["jpg", "png", "webp", "gif"];
const SEITENGROESSE = 100;

const loeschen = process.argv.includes("--loeschen");

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error(
    "SUPABASE_URL und SUPABASE_SECRET_KEY müssen gesetzt sein.\n" +
      "Der Secret Key ist der Service-Role-Key des Projekts — er umgeht RLS,\n" +
      "gehört also in die Umgebung dieses einen Aufrufs und nirgendwo sonst hin.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Storage listet pro Ordner. Der Bucket ist nach Nutzer-ID gegliedert
// (0015: das erste Pfadsegment ist auth.uid()), also erst die Ordner, dann
// je Ordner die Dateien. list() liefert höchstens `limit` Einträge, deshalb
// beide Ebenen seitenweise.
async function listeVollstaendig(praefix) {
  const eintraege = [];
  for (let offset = 0; ; offset += SEITENGROESSE) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(praefix, { limit: SEITENGROESSE, offset });
    if (error) throw new Error(`list("${praefix}") fehlgeschlagen: ${error.message}`);
    if (!data || data.length === 0) break;
    eintraege.push(...data);
    if (data.length < SEITENGROESSE) break;
  }
  return eintraege;
}

async function alleObjektpfade() {
  const pfade = [];
  // Ordner haben in der Storage-API kein id-Feld, Dateien schon — das ist
  // der dokumentierte Weg, beide auseinanderzuhalten.
  for (const ordner of await listeVollstaendig("")) {
    if (ordner.id !== null && ordner.id !== undefined) {
      // Eine Datei direkt in der Bucket-Wurzel. Kann die App nicht erzeugt
      // haben (die Policy verlangt ein Ordnersegment), gehört aber gemeldet.
      pfade.push(ordner.name);
      continue;
    }
    for (const datei of await listeVollstaendig(ordner.name)) {
      if (datei.id === null || datei.id === undefined) continue;
      pfade.push(`${ordner.name}/${datei.name}`);
    }
  }
  return pfade;
}

// Alle referenzierten Pfade aus profiles.avatar_url. Gespeichert ist dort
// die vollständige öffentliche URL samt Cache-Buster (?v=…), gebraucht wird
// nur das Stück hinter "/avatars/".
async function referenziertePfade() {
  const marker = `/${BUCKET}/`;
  const referenziert = new Set();

  for (let von = 0; ; von += 1000) {
    const { data, error } = await supabase
      .from("profiles")
      .select("avatar_url")
      .not("avatar_url", "is", null)
      .range(von, von + 999);
    if (error) throw new Error(`profiles lesen fehlgeschlagen: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const { avatar_url: avatarUrl } of data) {
      const index = avatarUrl.indexOf(marker);
      if (index === -1) continue;
      // Query-String abschneiden: uploadAvatar() hängt ?v=<timestamp> an,
      // der Storage-Pfad selbst endet davor.
      referenziert.add(avatarUrl.slice(index + marker.length).split("?")[0]);
    }
    if (data.length < 1000) break;
  }

  return referenziert;
}

const [objekte, referenziert] = await Promise.all([alleObjektpfade(), referenziertePfade()]);
const verwaist = objekte.filter((pfad) => !referenziert.has(pfad));

console.log(`Objekte im Bucket:      ${objekte.length}`);
console.log(`Von Profilen referenziert: ${referenziert.size}`);
console.log(`Verwaist:               ${verwaist.length}`);

const unbekannteEndung = verwaist.filter(
  (pfad) => !BEKANNTE_ENDUNGEN.includes(pfad.split(".").pop()?.toLowerCase() ?? ""),
);
if (unbekannteEndung.length > 0) {
  console.warn(
    `\nAchtung: ${unbekannteEndung.length} verwaiste Objekte tragen eine Endung,\n` +
      "die uploadAvatar() nie vergibt. Vor dem Löschen ansehen — sie stammen\n" +
      "aus einem anderen Weg als dem Avatar-Upload.",
  );
  for (const pfad of unbekannteEndung) console.warn(`  ${pfad}`);
}

if (verwaist.length === 0) {
  console.log("\nNichts aufzuräumen.");
  process.exit(0);
}

if (!loeschen) {
  console.log("\nWürde gelöscht werden (Probelauf, --loeschen zum Ausführen):");
  for (const pfad of verwaist) console.log(`  ${pfad}`);
  process.exit(0);
}

// In Blöcken, damit ein Rückstand nicht in einem einzigen Request landet.
for (let i = 0; i < verwaist.length; i += SEITENGROESSE) {
  const block = verwaist.slice(i, i + SEITENGROESSE);
  const { error } = await supabase.storage.from(BUCKET).remove(block);
  if (error) {
    console.error(`Löschen fehlgeschlagen bei Block ab ${i}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Gelöscht: ${Math.min(i + block.length, verwaist.length)}/${verwaist.length}`);
}

console.log("Fertig.");
