// Was die Aufzeichnung über das Gerät wissen muss, bevor sie etwas
// verspricht. Rein und ohne Browser-Zugriff, damit es testbar bleibt — die
// Werte (User-Agent, Touchpunkte, Standalone) reicht der Aufrufer herein.
//
// Warum das überhaupt eine Rolle spielt: eine Web-App bekommt im Hintergrund
// kein GPS. Wie hart das trifft und wo man den Standort wieder freigibt,
// hängt aber am Gerät — auf dem iPhone ist die Aufzeichnung weg, sobald der
// Bildschirm ausgeht, und die Freigabe liegt an einer anderen Stelle als in
// Chrome auf Android. Ein allgemeiner Satz ("in den Einstellungen erlauben")
// hilft dort niemandem, der mit Handschuhen am Strassenrand steht.

export type Plattform = "ios" | "android" | "desktop";

export interface Geraet {
  plattform: Plattform;
  /** Vom Home-Bildschirm gestartet (installierte Web-App), nicht im Browser-Tab. */
  standalone: boolean;
}

export function erkenneGeraet({
  userAgent,
  maxTouchPoints,
  standalone,
}: {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
}): Geraet {
  const ua = userAgent.toLowerCase();
  // iPadOS meldet sich seit Version 13 als "Macintosh". Ein Mac hat aber
  // keinen Touchscreen — mehr als ein Touchpunkt heisst iPad.
  const ios = /iphone|ipad|ipod/.test(ua) || (ua.includes("macintosh") && maxTouchPoints > 1);
  if (ios) return { plattform: "ios", standalone };
  if (ua.includes("android")) return { plattform: "android", standalone };
  return { plattform: "desktop", standalone };
}

/**
 * Wo man einen verweigerten Standort wieder freigibt. Ein Satz, der zum Gerät
 * passt — die Alternative war "Bitte in den Einstellungen erlauben", und
 * welche Einstellungen, blieb offen.
 */
export function standortAnleitung(geraet: Geraet): string {
  if (geraet.plattform === "ios") {
    return geraet.standalone
      ? "So gibst du ihn frei: Einstellungen › Datenschutz & Sicherheit › Ortungsdienste › Safari-Websites › «Beim Verwenden der App». Danach Strado neu öffnen."
      : "So gibst du ihn frei: in der Adressleiste auf «aA» tippen › Website-Einstellungen › Standort › Erlauben. Danach die Seite neu laden.";
  }
  if (geraet.plattform === "android") {
    return "So gibst du ihn frei: links neben der Adresse auf das Symbol tippen › Berechtigungen › Standort › Zulassen. Danach die Seite neu laden.";
  }
  return "So gibst du ihn frei: links neben der Adresse auf das Symbol klicken und den Standort erlauben. Danach die Seite neu laden.";
}

export interface FahrHinweis {
  id: "standort" | "bildschirm" | "halterung";
  titel: string;
  text: string;
}

/**
 * Die drei Dinge, die vor der ersten Fahrt stimmen müssen. Der Bildschirm-
 * Satz ist der einzige, der vom Gerät abhängt: auf dem iPhone ist er keine
 * Empfehlung, sondern die Bedingung dafür, dass überhaupt aufgezeichnet wird.
 */
export function fahrHinweise(geraet: Geraet): FahrHinweis[] {
  const bildschirm =
    geraet.plattform === "ios"
      ? "Auf dem iPhone stoppt die Aufzeichnung, sobald der Bildschirm ausgeht oder du die App wechselst. Stell die automatische Sperre für die Fahrt auf «Nie» (Einstellungen › Anzeige & Helligkeit)."
      : "Strado hält den Bildschirm an, solange die Aufzeichnung offen ist. Wechselst du die App, pausiert sie.";
  return [
    {
      id: "standort",
      titel: "Standort",
      text: "Gleich fragt dein Browser nach dem Standort. Ohne ihn gibt es keine Fahrt: Strecke, Tempo und Zeit kommen aus dem GPS.",
    },
    { id: "bildschirm", titel: "Bildschirm an", text: bildschirm },
    {
      id: "halterung",
      titel: "In die Halterung",
      text: "Handy fest montieren, bevor du losfährst. Bedienen musst du während der Fahrt nichts.",
    },
  ];
}
