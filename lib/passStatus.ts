// Wie ein Passstatus aussieht und wie alt er sein darf.
//
// Rein und ohne Server-Import: die Statuszeile steht sowohl auf serverseitig
// gerenderten Seiten (Streckenseite, /paesse) als auch in der
// Moderationsansicht, die eine Client-Komponente ist.
import type { PassZustand } from "@/lib/passMeldungen";

export type { PassZustand };

/**
 * Ein Feed-Status, der älter als das hier ist, gilt als nicht mehr belastbar:
 * der Abgleich läuft alle fünf Minuten (vercel.json), sechs ausgefallene Läufe
 * sind ein Ausfall und kein Ausrutscher.
 *
 * Die Zahl entscheidet, ob die App "offen" sagt oder schweigt — sie steht
 * deshalb hier und nicht an der Abfragestelle.
 */
export const FEED_MAX_ALTER_MS = 30 * 60 * 1000;

export function istFeedGesund(erfolgAm: string | null, jetzt: Date = new Date()): boolean {
  if (!erfolgAm) return false;
  const stand = new Date(erfolgAm).getTime();
  if (Number.isNaN(stand)) return false;
  return jetzt.getTime() - stand <= FEED_MAX_ALTER_MS;
}

export const ZUSTAND_LABEL: Record<PassZustand, string> = {
  offen: "Offen",
  eingeschraenkt: "Eingeschränkt",
  gesperrt: "Gesperrt",
  wintersperre: "Wintersperre",
  unbekannt: "Kein Stand",
};

/** Was der Zustand bedeutet, in einem Satz ohne Zahlen. */
export const ZUSTAND_ERKLAERUNG: Record<PassZustand, string> = {
  offen: "Keine Sperrung gemeldet.",
  eingeschraenkt: "Befahrbar, aber mit Einschränkung.",
  gesperrt: "Für den Verkehr gesperrt.",
  wintersperre: "Über den Winter geschlossen.",
  unbekannt: "Zurzeit keine verlässliche Meldung.",
};

export type StatusTon = "gut" | "warnung" | "schlecht" | "still";

// Die Töne zeigen auf die Statustokens aus app/globals.css (success/warning/
// danger) — keine eigenen Farbwerte, damit Hell und Dunkel mitkommen.
export const ZUSTAND_TON: Record<PassZustand, StatusTon> = {
  offen: "gut",
  eingeschraenkt: "warnung",
  gesperrt: "schlecht",
  wintersperre: "schlecht",
  unbekannt: "still",
};

/**
 * "vor 4 Minuten", "vor 2 Stunden", "am 03.09.2026".
 *
 * Ab einem Tag wird das Datum genannt statt "vor 9 Tagen": bei einem so alten
 * Stand ist der Tag die nützlichere Angabe, und die Zeile erklärt damit
 * zugleich, warum der Status nichts mehr behauptet.
 */
export function seitWann(zeitpunkt: string | null, jetzt: Date = new Date()): string | null {
  if (!zeitpunkt) return null;
  const dann = new Date(zeitpunkt);
  if (Number.isNaN(dann.getTime())) return null;

  const sekunden = Math.floor((jetzt.getTime() - dann.getTime()) / 1000);
  if (sekunden < 0) return "gerade eben";
  if (sekunden < 90) return "gerade eben";

  const minuten = Math.round(sekunden / 60);
  if (minuten < 60) return `vor ${minuten} Minuten`;

  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return `vor ${stunden} ${stunden === 1 ? "Stunde" : "Stunden"}`;

  return `am ${new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Zurich",
  }).format(dann)}`;
}

export interface PassStatusAnzeige {
  zustand: PassZustand;
  /** Kurzform für Listen: "Wintersperre", "Offen". */
  label: string;
  ton: StatusTon;
  /** Die Meldung des Feeds oder der Moderation, sonst die Erklärung. */
  text: string;
  /** "ASTRA · vor 4 Minuten" bzw. "Von Hand gesetzt · vor 2 Stunden". */
  herkunft: string;
}

/**
 * Alles, was eine Statuszeile zeigt, an einer Stelle zusammengesetzt — damit
 * Streckenseite, Passliste und Moderation nicht dreimal entscheiden, wie aus
 * Zustand, Quelle und Alter ein Satz wird.
 */
export function anzeigeFuerStatus(
  status: {
    zustand: PassZustand;
    meldung: string | null;
    quelle: "feed" | "moderation";
    aktualisiertAm: string | null;
    /** Bis wann eine Setzung von Hand gilt (0104). Fehlt sie, altert die
     *  Setzung nie — genau das war der Fehler, den der Kommentar unten
     *  beschreibt. */
    manuellBis?: string | null;
  } | null,
  feedErfolgAm: string | null,
  jetzt: Date = new Date(),
): PassStatusAnzeige {
  // Ohne Zeile in pass_status war der Pass noch nie Gegenstand eines
  // Abgleichs — dasselbe wie "kein Stand", nur aus einem anderen Grund.
  if (!status) {
    return {
      zustand: "unbekannt",
      label: ZUSTAND_LABEL.unbekannt,
      ton: ZUSTAND_TON.unbekannt,
      text: ZUSTAND_ERKLAERUNG.unbekannt,
      herkunft: "Noch kein Abgleich",
    };
  }

  // Ein Feed-Status altert mit dem Feed; ein von Hand gesetzter mit seiner
  // Frist.
  //
  // Die Frist war zuerst nur ein Satz in diesem Kommentar: geprüft wurde
  // allein die Quelle, `manuell_bis` kam gar nicht bis hierher. Eine
  // Übersteuerung galt damit ewig — und das trifft ausgerechnet den
  // Betriebszustand ohne ASTRA-Schlüssel, in dem nie ein Feed-Lauf
  // dazwischenschreibt: ein vor 240 Tagen gesetztes "gesperrt" stünde heute
  // noch als aktuelle Auskunft da.
  //
  // `manuell_bis === null` gehört genauso hierher, und das war die zweite
  // Hälfte desselben Fehlers: pass_status_freigeben (0104) setzt nur die
  // Frist auf null und lässt `quelle` und `zustand` stehen. Ohne diesen Zweig
  // war die ausdrückliche Freigabe schlechter als das blosse Ablaufenlassen —
  // ein freigegebenes "gesperrt" galt unbefristet als aktuelle Auskunft,
  // während dieselbe Setzung mit abgelaufener Frist korrekt auf "unbekannt"
  // fiel. Der Knopf heisst "Freigeben"; danach soll der Feed zuständig sein,
  // und wo der nichts liefert, ist die ehrliche Antwort "unbekannt".
  // !manuellBis statt === null: das Feld ist optional, und eine fehlende
  // Frist bedeutet dasselbe wie eine zurückgesetzte — es übersteuert nichts
  // mehr. Die frühere Zeile las sie mit Boolean() genauso.
  const handSetzungGiltNichtMehr =
    status.quelle === "moderation" &&
    (!status.manuellBis || new Date(status.manuellBis).getTime() <= jetzt.getTime());
  const freigegeben = status.quelle === "moderation" && !status.manuellBis;

  const veraltet =
    (status.quelle === "feed" || handSetzungGiltNichtMehr) && !istFeedGesund(feedErfolgAm, jetzt);
  const zustand: PassZustand = veraltet ? "unbekannt" : status.zustand;

  const alter = seitWann(status.aktualisiertAm, jetzt);
  const quelle = status.quelle === "moderation" ? "Von Hand gesetzt" : "ASTRA-Verkehrsmeldungen";

  return {
    zustand,
    label: ZUSTAND_LABEL[zustand],
    ton: ZUSTAND_TON[zustand],
    text: veraltet
      ? freigegeben
        ? "Die Setzung von Hand wurde freigegeben, und der Abgleich mit den Verkehrsmeldungen liefert gerade nichts."
        : handSetzungGiltNichtMehr
          ? "Die Setzung von Hand ist abgelaufen, und der Abgleich mit den Verkehrsmeldungen liefert gerade nichts."
          : "Der Abgleich mit den Verkehrsmeldungen hängt gerade — der letzte Stand ist zu alt, um ihn zu zeigen."
      : (status.meldung ?? ZUSTAND_ERKLAERUNG[zustand]),
    herkunft: alter ? `${quelle} · ${alter}` : quelle,
  };
}

/** Der schwerwiegendste Zustand mehrerer Pässe — eine Strecke über zwei Pässe
 *  ist gesperrt, sobald einer von beiden es ist. */
const SCHWERE: Record<PassZustand, number> = {
  offen: 0,
  unbekannt: 1,
  eingeschraenkt: 2,
  gesperrt: 3,
  wintersperre: 3,
};

export function schwerwiegendster(zustaende: PassZustand[]): PassZustand | null {
  if (zustaende.length === 0) return null;
  return zustaende.reduce((a, b) => (SCHWERE[b] > SCHWERE[a] ? b : a));
}

/** Auf Streckenlisten wird nur gezeigt, was die Planung ändert. "Offen" ist
 *  die Erwartung und braucht kein Abzeichen. */
export function zeigeInListe(zustand: PassZustand | null): boolean {
  return zustand !== null && zustand !== "offen" && zustand !== "unbekannt";
}
