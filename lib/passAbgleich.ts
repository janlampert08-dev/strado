// Reine Hilfen für den Passstatus-Cron (app/api/cron/passstatus/route.ts):
// wie viele Aufrufe gleichzeitig laufen, und wie sich die wegfallenden
// Verkehrsmeldungen mit möglichst wenigen DELETE-Anweisungen löschen lassen.
// Herausgezogen, damit beides ohne Datenbank prüfbar ist.

/**
 * Führt fn für jedes Element aus, höchstens `grenze` gleichzeitig, und gibt
 * die Ergebnisse in der Reihenfolge der Eingabe zurück.
 *
 * Warum eine Grenze und kein blankes Promise.all: ein Vollabruf bewertet alle
 * 34 Pässe. 34 gleichzeitige HTTP-Anfragen an PostgREST aus einer einzigen
 * Funktion wären Last-Spitzen im Takt von fünf Minuten, für eine Arbeit, die
 * bei sechs parallelen Aufrufen schon fast ganz in der Wartezeit einer
 * einzelnen Anfrage verschwindet.
 *
 * fn darf nicht werfen, wenn ein Fehler einzeln zählen soll — ein Wurf bricht
 * wie bei Promise.all das Ganze ab. Der Cron fängt Fehler deshalb in fn und
 * gibt sie als Wert zurück.
 */
export async function mitHoechstens<T, R>(
  elemente: readonly T[],
  grenze: number,
  fn: (element: T, index: number) => Promise<R>,
): Promise<R[]> {
  const ergebnisse = new Array<R>(elemente.length);
  let naechster = 0;
  const arbeiter = async () => {
    while (naechster < elemente.length) {
      const index = naechster++;
      ergebnisse[index] = await fn(elemente[index], index);
    }
  };
  const anzahl = Math.max(1, Math.min(grenze, elemente.length));
  await Promise.all(Array.from({ length: anzahl }, arbeiter));
  return ergebnisse;
}

export interface MeldungsSchluessel {
  situation_id: string;
  pass_id: string;
}

/** Eine DELETE-Anweisung: alle Zeilen mit situation_id ∈ situationIds UND pass_id ∈ passIds. */
export interface LoeschGruppe {
  situationIds: string[];
  passIds: string[];
  /** Die Zeilen, die diese Gruppe tatsächlich trifft — für Fehlerzählung und "betroffen". */
  zeilen: MeldungsSchluessel[];
}

const schluessel = (z: MeldungsSchluessel) => JSON.stringify([z.situation_id, z.pass_id]);

/**
 * Teilt die wegfallenden Zeilen in möglichst wenige DELETE-Anweisungen.
 *
 * Der Schlüssel von verkehrsmeldungen ist zusammengesetzt (situation_id,
 * pass_id), und PostgREST kennt keinen Filter "Paar in Liste" ohne einen
 * zusammengebauten or()-String — den mit Situations-IDs aus einem fremden
 * Feed zu füllen, wäre die Art Filter-Injektion, die man nicht haben will.
 * .in() dagegen maskiert jeden Wert selbst.
 *
 * Also: eine Anweisung "situation_id in S and pass_id in P" über alle
 * wegfallenden Zeilen. Sie trifft das Kreuzprodukt S×P und ist nur dann
 * genau, wenn keine Zeile, die BLEIBEN soll, in diesem Kreuzprodukt liegt.
 * Das wird hier geprüft; trifft es nicht zu, gibt es eine Anweisung je Pass
 * (innerhalb eines Passes ist pass_id fest, das Kreuzprodukt also genau die
 * gewünschten Zeilen). Im Normalfall — eine Handvoll Meldungen auf ein bis
 * drei Pässen — ist es eine einzige Anweisung.
 *
 * `bleibend` muss alles enthalten, was nach dem Lauf noch in der Tabelle
 * stehen soll: die gelesenen, nicht wegfallenden Zeilen UND die eben
 * geschriebenen Treffer (die beim Lesen noch nicht da sein mussten).
 */
export function loeschGruppen(
  wegfallend: readonly MeldungsSchluessel[],
  bleibend: readonly MeldungsSchluessel[],
): LoeschGruppe[] {
  if (wegfallend.length === 0) return [];

  const situationIds = [...new Set(wegfallend.map((z) => z.situation_id))];
  const passIds = [...new Set(wegfallend.map((z) => z.pass_id))];
  const s = new Set(situationIds);
  const p = new Set(passIds);
  const weg = new Set(wegfallend.map(schluessel));

  const kollidiert = bleibend.some(
    (z) => s.has(z.situation_id) && p.has(z.pass_id) && !weg.has(schluessel(z)),
  );
  if (!kollidiert) return [{ situationIds, passIds, zeilen: [...wegfallend] }];

  const jePass = new Map<string, MeldungsSchluessel[]>();
  for (const zeile of wegfallend) {
    jePass.set(zeile.pass_id, [...(jePass.get(zeile.pass_id) ?? []), zeile]);
  }
  return [...jePass].map(([passId, zeilen]) => ({
    situationIds: [...new Set(zeilen.map((z) => z.situation_id))],
    passIds: [passId],
    zeilen,
  }));
}
