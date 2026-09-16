import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Die Zahlen, die ein Creator unter /creator sieht, und dieselben Zahlen
// für die Moderation unter /moderation/creator.
//
// Gelesen wird ausschliesslich über die beiden SECURITY DEFINER-Funktionen
// aus Migration 0091, nie über die Tabellen. Der Grund steht ausführlich
// dort und kurz hier: creator_konversionen trägt user_id. Ein Creator darf
// erfahren, DASS zwölf Leute über ihn kamen — niemals WER. Eine
// zeilenweise Freigabe, wie eng auch immer, beantwortet zwangsläufig die
// zweite Frage mit; aggregiert wird deshalb in der Datenbank, und heraus
// kommt nur die Zahl.
//
// Wer welche Codes sieht, entscheidet ebenfalls die Datenbank: die eigenen,
// als Moderator alle. Diese Datei prüft das nicht noch einmal und könnte es
// auch nicht — sie sieht nur, was zurückkommt.

export interface CreatorKennzahl {
  code: string;
  name: string;
  kanal: string;
  kampagne: string | null;
  aktiv: boolean;
  klicks: number;
  registrierungen: number;
  abos: number;
  abosBeendet: number;
}

// Nur Aufrufe, mit Absicht: creator_verlauf() gab bis 0094 auch
// Registrierungen und Abos pro Tag zurück. Gezeichnet hat die Oberfläche
// davon nie etwas, und bei kleinen Zahlen verriet ein Tagesbucket mit einer
// einzigen Registrierung darin den Tag eines einzelnen Kontos — gegen die
// Zusicherung in der Datenschutzerklärung. Die Gesamtzahlen stehen in
// creatorKennzahlen(); wer hier wieder eine Zeitachse je Konversion
// braucht, löst zuerst die Frage, ab welcher Menge ein Bucket etwas
// preisgibt.
export interface CreatorVerlaufTag {
  code: string;
  /** ISO-Datum (YYYY-MM-DD), Tagesgrenzen in der Zeitzone der Datenbank. */
  tag: string;
  klicks: number;
}

interface KennzahlZeile {
  code: string;
  name: string;
  kanal: string;
  kampagne: string | null;
  aktiv: boolean;
  klicks: number | string;
  registrierungen: number | string;
  abos: number | string;
  abos_beendet: number | string;
}

interface VerlaufZeile {
  code: string;
  tag: string;
  klicks: number | string;
}

// count(*) und sum() liefern in Postgres bigint, und PostgREST reicht
// bigint als JSON-String durch, sobald er gross genug wird. Number() davor,
// damit in der Oberfläche nicht irgendwann "12" + 1 = "121" steht.
function zahl(wert: number | string | null | undefined): number {
  const n = typeof wert === "string" ? Number(wert) : (wert ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Pro Request memoisiert: die Moderationsseite braucht dieselben Zahlen wie
// die Kopfzeile darüber, und /creator liest sie für Summen und Verlauf.
export const creatorKennzahlen = cache(
  async function creatorKennzahlen(): Promise<CreatorKennzahl[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creator_kennzahlen");

    if (error) {
      console.error("Creator-Kennzahlen konnten nicht gelesen werden", error);
      return [];
    }

    const zeilen: KennzahlZeile[] = Array.isArray(data) ? data : [];
    return zeilen.map((z) => ({
      code: z.code,
      name: z.name,
      kanal: z.kanal,
      kampagne: z.kampagne,
      aktiv: z.aktiv,
      klicks: zahl(z.klicks),
      registrierungen: zahl(z.registrierungen),
      abos: zahl(z.abos),
      abosBeendet: zahl(z.abos_beendet),
    }));
  },
);

export async function creatorVerlauf(tage = 30): Promise<CreatorVerlaufTag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_verlauf", {
    p_tage: tage,
  });

  if (error) {
    console.error("Creator-Verlauf konnte nicht gelesen werden", error);
    return [];
  }

  const zeilen: VerlaufZeile[] = Array.isArray(data) ? data : [];
  return zeilen.map((z) => ({
    code: z.code,
    tag: z.tag,
    klicks: zahl(z.klicks),
  }));
}

// Die Codes, die diesem Konto gehören.
//
// Bewusst nicht über creatorKennzahlen(): die Datenbankfunktion gibt einem
// Moderator jede Zeile zurück (0091, dort begründet — die Moderationsansicht
// lebt davon). Für "was ist meins" ist das die falsche Frage, und zwar in
// beide Richtungen: ein Moderator stünde sonst als Creator in der Navigation,
// ohne einer zu sein, und sähe unter /creator fremde Zahlen als seine
// eigenen. Hier wird deshalb auf die Spalte gefiltert — die SELECT-Policy aus
// 0091 gibt genau diese Zeilen frei.
//
// Memoisiert, weil <Header /> die Frage auf jeder Seite stellt und /creator
// sie gleich noch einmal braucht.
export const eigeneCodes = cache(async function eigeneCodes(
  userId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creator_links")
    .select("code")
    .eq("creator_user_id", userId);

  if (error) {
    // Kein throw: ein Fehler hier darf höchstens den Navigationseintrag
    // kosten, nicht die Seite. /creator prüft ohnehin selbst.
    console.error("Eigene Creator-Codes konnten nicht gelesen werden", error);
    return [];
  }
  return (data ?? []).map((zeile) => zeile.code as string);
});

// Ob dem angemeldeten Konto mindestens ein Code gehört — die einzige
// Definition der Creator-Rolle, die es gibt (siehe 0091: es gibt keine
// Spalte profiles.ist_creator, und das ist Absicht).
export async function istCreator(userId: string): Promise<boolean> {
  return (await eigeneCodes(userId)).length > 0;
}

// ---------------------------------------------------------------------------
// Reine Rechnung — hier, weil Vitest mit environment: "node" nur lib/ erreicht
// und die Seiten selbst im Projekt keine Testschicht haben.
// ---------------------------------------------------------------------------

export interface CreatorSumme {
  klicks: number;
  registrierungen: number;
  abos: number;
  abosBeendet: number;
}

export function summiere(kennzahlen: CreatorKennzahl[]): CreatorSumme {
  return kennzahlen.reduce<CreatorSumme>(
    (summe, k) => ({
      klicks: summe.klicks + k.klicks,
      registrierungen: summe.registrierungen + k.registrierungen,
      abos: summe.abos + k.abos,
      abosBeendet: summe.abosBeendet + k.abosBeendet,
    }),
    { klicks: 0, registrierungen: 0, abos: 0, abosBeendet: 0 },
  );
}

// Anteil in Prozent, auf eine Nachkommastelle. null statt 0, wenn der
// Nenner fehlt: "0 %" bei null Klicks behauptet ein Ergebnis, wo es keine
// Messung gibt.
//
// null auch, wenn der Zähler grösser ist als der Nenner. Das ist kein
// Rechenfehler, sondern eine Eigenschaft der Daten: die Klickzahl ist
// verlustbehaftet (das IP-Limit im Route Handler verwirft Zählungen, und ein
// Besucher mit bestehendem Cookie klickt gar nicht erst neu), während die
// Registrierung dahinter trotzdem ankommt. "200 %" wäre die Zahl, die ein
// Creator am ehesten abfotografiert.
export function anteil(zaehler: number, nenner: number): number | null {
  if (!Number.isFinite(zaehler) || !Number.isFinite(nenner) || nenner <= 0)
    return null;
  if (zaehler > nenner) return null;
  return Math.round((zaehler / nenner) * 1000) / 10;
}

// Derselbe Anteil als fertiger Text, oder null, wenn anteil() null sagt.
//
// Komma statt Punkt: die Oberfläche ist deutschsprachig. Das weicht bewusst
// von toLocaleString("de-CH") ab, das hier "12.5" lieferte — ein Punkt
// neben dem Apostroph-Tausender der übrigen Zahlen liest sich auf einer
// Prozentangabe wie ein Tippfehler. Stand hier schon so, als der Trichter
// noch eine eigene Kachel-Komponente hatte; die ist weg, die Schreibweise
// bleibt.
export function anteilText(zaehler: number, nenner: number): string | null {
  const quote = anteil(zaehler, nenner);
  return quote === null ? null : `${String(quote).replace(".", ",")} %`;
}

// Balkenhöhe in Prozent für den Verlauf. Ein Tag mit Wert > 0 bekommt
// mindestens 10 %, sonst wäre ein einzelner Klick neben einem Ausreisser
// optisch dasselbe wie gar nichts.
//
// Die 10 % sind an der Bahnhöhe gerechnet, nicht geschätzt: die Bahn ist
// h-12 (48 px), ein leerer Tag steht als 2-px-Strich da. Bei den früheren
// 4 % war ein Tag MIT Bewegung 1.92 px hoch — niedriger als der Strich, der
// gar nichts bedeutet, womit die Untergrenze genau das verfehlte, wofür es
// sie gibt. 10 % ergeben 4.8 px und damit denselben Abstand wie in
// FahrtStatistik.tsx (8 px Minimum auf 80 px Bahn).
export function balkenHoehe(wert: number, hoechstwert: number): number {
  if (wert <= 0 || hoechstwert <= 0) return 0;
  return Math.max(10, Math.round((wert / hoechstwert) * 100));
}

export interface VerlaufReihe {
  code: string;
  tage: CreatorVerlaufTag[];
  hoechstwert: number;
}

// Gruppiert den flachen Verlauf nach Code und merkt sich je Reihe den
// höchsten Klickwert — die Bezugsgrösse für balkenHoehe(). Pro Code
// skaliert und nicht global: ein Creator mit tausend Klicks würde sonst
// jeden anderen zu einer leeren Linie zusammendrücken.
export function verlaufNachCode(verlauf: CreatorVerlaufTag[]): VerlaufReihe[] {
  const reihen = new Map<string, CreatorVerlaufTag[]>();
  for (const tag of verlauf) {
    const vorhanden = reihen.get(tag.code);
    if (vorhanden) vorhanden.push(tag);
    else reihen.set(tag.code, [tag]);
  }
  return [...reihen.entries()].map(([code, tage]) => ({
    code,
    tage,
    hoechstwert: tage.reduce((max, t) => Math.max(max, t.klicks), 0),
  }));
}
