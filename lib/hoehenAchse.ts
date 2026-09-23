// Die senkrechte Achse eines Höhenprofils.
//
// Bis 2026-09-23 lief sie von der tiefsten zur höchsten Stelle der Strecke —
// jede Strecke füllte die volle Höhe. Eine Stadtrunde mit 160 m Unterschied
// sah damit so dramatisch aus wie der Albula mit 950 m: das Bild behauptete
// eine Steigung, die es nicht gibt. Jetzt hat die Achse eine Mindestspanne,
// und flache Strecken sehen flach aus.
//
// Dazu Höhenlinien wie auf einer Landeskarte: alle 100 m, ab 1000 m Spanne
// alle 500 m (sonst wären es auf einem Pass zwanzig Linien).

/** Kleinste dargestellte Höhenspanne. */
export const MINDEST_SPANNE_M = 300;

export interface HoehenAchse {
  unten: number;
  oben: number;
  /** Höhen, auf denen eine Höhenlinie liegt, aufsteigend. */
  linien: number[];
}

export function hoehenAchse(mMin: number, mMax: number): HoehenAchse {
  const tief = Math.min(mMin, mMax);
  const hoch = Math.max(mMin, mMax);
  let unten = tief;
  let oben = hoch;
  if (oben - unten < MINDEST_SPANNE_M) {
    const mitte = (oben + unten) / 2;
    unten = mitte - MINDEST_SPANNE_M / 2;
    oben = mitte + MINDEST_SPANNE_M / 2;
  }
  const schritt = oben - unten > 1000 ? 500 : 100;
  const linien: number[] = [];
  for (let m = Math.ceil(unten / schritt) * schritt; m <= oben; m += schritt) linien.push(m);
  return { unten, oben, linien };
}
