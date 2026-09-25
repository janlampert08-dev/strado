import { createHmac } from "node:crypto";
import { cropTrackEndsKreise, type KappKreis } from "@/lib/track";

// Verschleierte Privatzone für öffentlich geteilte Tracks.
//
// WARUM NICHT EINFACH "r UM DEN ERSTEN PUNKT"
//
// Bis 0132 schnitt cropTrackEnds (lib/track.ts) alles weg, was im Radius r
// um den rohen ersten bzw. letzten Punkt lag. Der erste sichtbare Punkt lag
// damit immer knapp ausserhalb eines Kreises mit Radius r um die Haustür.
// Wer zwei, drei geteilte Fahrten desselben Fahrers ansieht, die in
// verschiedene Richtungen losgehen, hat drei Punkte auf demselben Kreis —
// und damit dessen Mitte, also die Adresse. Dass r selbst für jeden
// eingeloggten Nutzer lesbar war (Spalten-Grant aus 0045), machte es noch
// leichter; 0132 nimmt den Grant zurück, aber auch ohne ihn bleibt der
// Kreis bestimmbar (drei Punkte legen Mitte UND Radius fest).
//
// WAS STATTDESSEN GESCHIEHT (dasselbe Prinzip wie bei Strava)
//
// Der Kreis wird nicht um den Startpunkt gelegt, sondern um einen
// verschobenen, geheimen Mittelpunkt, und er ist grösser als r:
//
//   - Verschiebung: 0 bis r/2 in eine zufällige Richtung.
//   - Radius:       1.5·r bis 2·r.
//
// Beides zusammen hält die Zusage der Einstellung: der erste sichtbare
// Punkt liegt mindestens Radius − Verschiebung ≥ 1.5·r − 0.5·r = r vom
// Startpunkt entfernt. Wer 200 m gewählt hat, bekommt also weiterhin nie
// weniger als 200 m, nur nicht mehr "genau 200 m".
//
// Wer jetzt trianguliert, findet den verschobenen Mittelpunkt, nicht die
// Haustür — die liegt irgendwo in einer Scheibe mit Radius r/2 darum.
//
// WARUM DETERMINISTISCH UND PRO ZELLE
//
// Würfelte jede Fahrt eine neue Verschiebung, liesse sich über viele
// Fahrten mitteln: die Mittelpunkte streuen um die Haustür, ihr
// Schwerpunkt IST die Haustür. Deshalb ist die Verschiebung für denselben
// Nutzer am selben Ort immer dieselbe — abgeleitet per HMAC aus einem
// Servergeheimnis, der Nutzer-ID und der Rasterzelle (ZELLE_GRAD), in der
// der Punkt liegt. Pro Zelle und nicht pro Nutzer: sonst verriete ein
// einziger bekannter Ort (die öffentlich bekannte Arbeitsstelle) die
// Verschiebung für alle anderen, also auch für die Wohnung.
//
// Restrisiko, bewusst in Kauf genommen: liegt ein Startort nahe an einer
// Zellgrenze, landen Fahrten je nach GPS-Streuung mal in der einen, mal in
// der anderen Zelle und bekommen zwei verschiedene Mittelpunkte. Das sind
// zwei Stichproben statt beliebig vieler — Mitteln über zwei Punkte, die
// jeweils bis r/2 daneben liegen, ergibt keine Adresse.
//
// Das Geheimnis darf sich nicht beiläufig ändern: ein neues Geheimnis
// bedeutet neue Mittelpunkte, und wer alte und neue Tracks nebeneinander
// sieht, hat zwei Stichproben. Wer es wechselt, muss danach alle
// öffentlichen Tracks neu zuschneiden (recomputePublicTracks).

// Kantenlänge der Rasterzelle in Grad (Breite und Länge). 0.01° sind in der
// Schweiz rund 1.1 km Nord-Süd und 0.75 km Ost-West — deutlich grösser als
// die Streuung des ersten GPS-Fixes vor derselben Haustür, damit dieselbe
// Wohnung fast immer dieselbe Zelle trifft.
export const ZELLE_GRAD = 0.01;

// Verschiebung höchstens diesen Anteil von r, Radius zwischen diesen beiden
// Vielfachen von r. Die Mindestdistanz r ergibt sich aus
// RADIUS_MIN_FAKTOR − VERSCHIEBUNG_MAX_ANTEIL = 1 (siehe Kopfkommentar).
export const VERSCHIEBUNG_MAX_ANTEIL = 0.5;
export const RADIUS_MIN_FAKTOR = 1.5;
export const RADIUS_MAX_FAKTOR = 2;

// Versionskennung im HMAC-Eingang. Eine Änderung der Herleitung soll
// bewusst andere Werte ergeben als die alte, statt zufällig teilweise
// dieselben.
const KONTEXT = "strado-privatzone-v1";

const METER_PRO_GRAD_BREITE = 111_320;

function zelle(punkt: [number, number]): string {
  const [lng, lat] = punkt;
  return `${Math.floor(lat / ZELLE_GRAD)}:${Math.floor(lng / ZELLE_GRAD)}`;
}

// Drei gleichverteilte Zahlen in [0, 1) aus dem HMAC: je 32 Bit.
function zufallszahlen(geheimnis: string, userId: string, punkt: [number, number]) {
  const digest = createHmac("sha256", geheimnis)
    .update(`${KONTEXT}|${userId}|${zelle(punkt)}`)
    .digest();
  const teil = (offset: number) => digest.readUInt32BE(offset) / 2 ** 32;
  return { winkel: teil(0), abstand: teil(4), radius: teil(8) };
}

// Der verschleierte Kappkreis für ein Track-Ende. Rein und deterministisch:
// gleiche Eingaben, gleicher Kreis.
export function privatzonenKreis(
  punkt: [number, number],
  radiusM: number,
  userId: string,
  geheimnis: string,
): KappKreis {
  const z = zufallszahlen(geheimnis, userId, punkt);

  // Wurzel, damit die Verschiebung gleichmässig über die Scheibe verteilt
  // ist statt sich um die Mitte zu häufen — sonst läge die Haustür mit
  // erhöhter Wahrscheinlichkeit nahe am (triangulierbaren) Mittelpunkt.
  const abstandM = Math.sqrt(z.abstand) * VERSCHIEBUNG_MAX_ANTEIL * radiusM;
  const winkel = z.winkel * 2 * Math.PI;
  const [lng, lat] = punkt;
  const dLat = (abstandM * Math.cos(winkel)) / METER_PRO_GRAD_BREITE;
  const dLng =
    (abstandM * Math.sin(winkel)) /
    (METER_PRO_GRAD_BREITE * Math.cos((lat * Math.PI) / 180));

  const faktor = RADIUS_MIN_FAKTOR + z.radius * (RADIUS_MAX_FAKTOR - RADIUS_MIN_FAKTOR);
  return { zentrum: [lng + dLng, lat + dLat], radiusM: radiusM * faktor };
}

// Die öffentlich sichtbare Fassung eines Tracks. radiusM 0 heisst
// "Privatzone aus" — dann bleibt der Track, wie er ist.
export function verschleiertGekappt(
  coordinates: [number, number][],
  radiusM: number,
  userId: string,
  geheimnis: string,
): [number, number][] {
  if (radiusM <= 0 || coordinates.length < 2) return [...coordinates];
  return cropTrackEndsKreise(
    coordinates,
    privatzonenKreis(coordinates[0], radiusM, userId, geheimnis),
    privatzonenKreis(coordinates[coordinates.length - 1], radiusM, userId, geheimnis),
  );
}

// Das Servergeheimnis. PRIVATZONE_SECRET, wenn gesetzt, sonst der
// Supabase-Secret-Key, der auf jedem Server ohnehin vorhanden ist (derselbe
// Rückfall wie beim Wiederherstellungs-Cookie, lib/passwortWiederherstellung.ts;
// der Kontext-String oben trennt die beiden Verwendungen).
//
// null, wenn keines da ist. In Entwicklung gibt es dann einen festen
// Platzhalter; in Produktion nicht — ein bekanntes Geheimnis wäre eine
// Verschleierung, die jeder nachrechnen kann. Der Aufrufer veröffentlicht
// in dem Fall keinen Track (sichere Richtung: Zahlen ja, Karte nein).
export function privatzonenGeheimnis(): string | null {
  const geheimnis = process.env.PRIVATZONE_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY;
  if (geheimnis) return geheimnis;
  if (process.env.NODE_ENV === "production") return null;
  return "nur-entwicklung-kein-geheimnis";
}
