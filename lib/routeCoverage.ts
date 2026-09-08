import { haversineKm } from "@/lib/geo";

// Unter diesem Deckungsgrad (%) gilt eine Fahrt als möglicherweise abgekürzt
// oder am falschen Punkt gestartet/beendet — sie bleibt speicherbar, kann
// aber nicht öffentlich markiert werden (siehe lib/actions/completions.ts).
// Bewusst grosszügig: Alpenpässe haben Tunnel und dichten Wald, die GPS-Fixes
// zuverlässig ausfallen lassen, ohne dass der Nutzer tatsächlich abgekürzt hat.
export const COVERAGE_THRESHOLD_PERCENT = 75;

const SAMPLE_INTERVAL_KM = 0.1;
// Exportiert, da lib/lapDetection.ts denselben Korridor für die
// Rundenerkennung innerhalb einer freien Fahrt verwendet — eine Stelle für
// "was zählt als 'auf der Strecke'", nicht zwei potenziell auseinanderlaufende.
export const CORRIDOR_KM = 0.08;

// Tastet die offizielle Streckengeometrie alle SAMPLE_INTERVAL_KM ab und
// prüft je Abtastpunkt, ob mindestens ein aufgezeichneter GPS-Punkt innerhalb
// des Korridors liegt. Der Anteil abgedeckter Abtastpunkte ist ein einziger,
// robuster Indikator sowohl für Abkürzungen (Lücke in der Mitte) als auch für
// falsche Start-/Endpunkte (Lücke am Rand) — keine separate Logik nötig.
//
// Für sich genommen ist dieser Anteil aber blind dafür, WIE OFT ein
// Streckenstück befahren wurde, und das ist bei einer Strecke, die über
// dieselbe Strasse zurückführt, der ganze Unterschied: Auf einer 20 km
// langen Hin-und-zurück-Strecke liegt jeder Abtastpunkt des Rückwegs
// zugleich auf dem Hinweg. Wer nur die 10 km hinaus fährt, deckt damit
// rechnerisch 100 % ab — nachgewiesen im Audit vom 2026-09-06 (A1, dritter
// Punkt), indem die Funktion mit genau diesem Fall ausgeführt wurde.
//
// Deshalb die zweite, unabhängige Messung darunter: die zurückgelegte Länge
// im Verhältnis zur Streckenlänge. Sie kennt keine Positionen, nur Distanz,
// und lässt sich durch mehrfaches Befahren desselben Stücks nicht schönen.
// Das Ergebnis ist das Minimum aus beiden — eine Fahrt muss die Strecke
// berühren UND ihre Länge zurücklegen.
export function computeRouteCoverage(
  routeCoordinates: [number, number][],
  trail: [number, number][],
): number {
  if (routeCoordinates.length < 2 || trail.length === 0) return 0;

  const samples = sampleRoute(routeCoordinates, SAMPLE_INTERVAL_KM);
  if (samples.length === 0) return 0;

  const covered = samples.filter((sample) =>
    trail.some((point) => haversineKm(sample, point) <= CORRIDOR_KM),
  ).length;
  const beruehrt = Math.round((covered / samples.length) * 100);

  return Math.min(beruehrt, zurueckgelegtProzent(routeCoordinates, trail));
}

// Summierte Länge eines Linienzugs in Kilometern.
function laengeKm(coords: [number, number][]): number {
  let km = 0;
  for (let i = 1; i < coords.length; i++) km += haversineKm(coords[i - 1], coords[i]);
  return km;
}

// Wie viel der Streckenlänge die Aufzeichnung tatsächlich zurückgelegt hat,
// in Prozent und nach oben offen (ein Umweg gibt über 100 und wird vom
// Math.min oben ohnehin nicht wirksam).
//
// Bewusst grob: GPS-Rauschen verlängert die Rohsumme, die Douglas-Peucker-
// Vereinfachung des gespeicherten Tracks verkürzt sie, und eine Empfangs-
// lücke wird als Sehne statt als Strassenverlauf gemessen. Alle drei
// Abweichungen bewegen sich im niedrigen einstelligen Prozentbereich,
// während der Schwellenwert bei 75 % liegt und der Fall, um den es geht,
// bei rund 50 % landet.
//
// Ohne Streckenlänge gibt es nichts zu vergleichen — dann bleibt es beim
// Berührungsanteil allein.
function zurueckgelegtProzent(
  routeCoordinates: [number, number][],
  trail: [number, number][],
): number {
  const routeKm = laengeKm(routeCoordinates);
  if (!(routeKm > 0)) return 100;
  return Math.round((laengeKm(trail) / routeKm) * 100);
}

function sampleRoute(coords: [number, number][], intervalKm: number): [number, number][] {
  const samples: [number, number][] = [coords[0]];
  let accumulated = 0;
  for (let i = 1; i < coords.length; i++) {
    accumulated += haversineKm(coords[i - 1], coords[i]);
    if (accumulated >= intervalKm) {
      samples.push(coords[i]);
      accumulated = 0;
    }
  }
  samples.push(coords[coords.length - 1]);
  return samples;
}
