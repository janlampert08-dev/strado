// Wortmarke und Signet von strado als Kontur.
//
// Gesetzt in Familjen Grotesk Bold (700, SIL Open Font License) mit einer
// Laufweite von -0.03 em und danach in Pfade gewandelt. Bewusst Kontur statt
// Lebendtext: Kopfleiste, Freigabebilder, Favicon und das gezeichnete
// Fahrten-Bild (lib/shareImage.ts) zeigen so dieselbe Form, ohne dass die App
// einen dritten Webfont laden müsste — geladen werden nur Inter und IBM Plex
// Mono (app/layout.tsx). Satori (next/og) und Canvas können mit Pfaden
// umgehen, mit einem CSS-Webfont nicht ohne Weiteres.
//
// Erzeugt aus dem statischen 700er-Schnitt; Ursprung liegt links oben, die
// Maße unten sind die tatsächliche Tuschekontur.
//
// Das gilt für die Wortmarke. Das Signet darunter kommt seit September 2026
// nicht mehr aus der Schrift, sondern ist gezeichnete Geometrie — warum,
// steht dort.

export const WORTMARKE = {
  breite: 268.83,
  hoehe: 67.92,
  viewBox: "0 0 268.83 67.92",
  // Breite geteilt durch Höhe — für Aufrufer, die nur eine Höhe kennen.
  seitenverhaeltnis: 3.958,
  pfad:
    "M23.17 67.92Q14.83 67.92 9.88 65.29Q4.92 62.67 2.63 58.67Q0.33 54.67 0 50.67L12.83 50.67Q13.25 52.83 14.63 54.63Q16 56.42 18.29 57.42Q20.58 58.42 23.83 58.42Q27.83 58.42 29.58 57.04Q31.33 55.67 31.33 53.5Q31.33 51.5 29.71 50.13Q28.08 48.75 24.42 47.58L18.42 45.58Q14.08 44.08 10.42 42.29Q6.75 40.5 4.54 37.67Q2.33 34.83 2.33 30.33Q2.33 23.67 7.42 19.54Q12.5 15.42 21.83 15.42Q28.58 15.42 32.88 17.5Q37.17 19.58 39.33 23.04Q41.5 26.5 41.83 30.67L29.5 30.67Q29.08 27.67 27 26.04Q24.92 24.42 21.33 24.42Q18.08 24.42 16.46 25.67Q14.83 26.92 14.83 29.08Q14.83 31.25 16.58 32.67Q18.33 34.08 21.92 35.25L27.92 37.17Q32.25 38.5 35.88 40.29Q39.5 42.08 41.67 44.96Q43.83 47.83 43.83 52.42Q43.83 59.42 38.54 63.67Q33.25 67.92 23.17 67.92M70.67 66.67L56.33 66.67Q54.42 64.42 53.29 61.25Q52.17 58.08 52.17 51.75L52.17 26.17L45.33 26.17L45.33 16.67L52.33 16.67L52.33 4.17L65.58 4.17L65.58 16.67L73.67 16.67L73.67 26.17L65.58 26.17L65.58 50.33Q65.58 56.92 67.08 60.42Q68.58 63.92 70.67 66.17L70.67 66.67M92.67 66.67L79.17 66.67L79.17 16.67L91.5 16.67L91.5 25.83L93.5 25.83Q94 23.33 95.37 21.13Q96.75 18.92 99.58 17.54Q102.42 16.17 107.17 16.17L109.83 16.17L109.83 28.33L106.17 28.33Q99.08 28.33 95.87 31.92Q92.67 35.5 92.67 42.67L92.67 66.67M130.83 67.67Q123.83 67.67 119.33 64.29Q114.83 60.92 112.67 55Q110.5 49.08 110.5 41.58Q110.5 33.83 112.71 28Q114.92 22.17 119.42 18.92Q123.92 15.67 130.75 15.67Q136 15.67 139.38 17.71Q142.75 19.75 144.5 23.17L146.5 23.17L146.5 16.67L159 16.67L159 66.67L146.5 66.67L146.5 60.17L144.5 60.17Q142.75 63.33 139.42 65.5Q136.08 67.67 130.83 67.67M134.33 58.17Q139.42 58.17 142.46 53.71Q145.5 49.25 145.5 41.67Q145.5 34 142.46 29.58Q139.42 25.17 134.33 25.17Q129.75 25.17 127.12 29.29Q124.5 33.42 124.5 41.67Q124.5 49.92 127.12 54.04Q129.75 58.17 134.33 58.17M185 67.67Q178.17 67.67 173.75 64.29Q169.33 60.92 167.17 55Q165 49.08 165 41.58Q165 33.83 167.21 28Q169.42 22.17 173.88 18.92Q178.33 15.67 185 15.67Q189.92 15.67 193.04 17.42Q196.17 19.17 198 22.17L200 22.17L200 0L213.5 0L213.5 66.67L201 66.67L201 60.17L199 60.17Q197.25 63.33 193.92 65.5Q190.58 67.67 185 67.67M188.83 58.17Q193.92 58.17 196.96 53.71Q200 49.25 200 41.67Q200 34 196.96 29.58Q193.92 25.17 188.83 25.17Q184.25 25.17 181.63 29.29Q179 33.42 179 41.67Q179 49.92 181.63 54.04Q184.25 58.17 188.83 58.17M244.17 67.92Q231.75 67.92 225.63 60.79Q219.5 53.67 219.5 41.67Q219.5 29.67 225.63 22.54Q231.75 15.42 244.17 15.42Q256.58 15.42 262.71 22.54Q268.83 29.67 268.83 41.67Q268.83 53.67 262.71 60.79Q256.58 67.92 244.17 67.92M244.17 58.92Q249.67 58.92 252.25 54.58Q254.83 50.25 254.83 41.58Q254.83 33 252.25 28.71Q249.67 24.42 244.17 24.42Q238.67 24.42 236.08 28.71Q233.5 33 233.5 41.58Q233.5 50.25 236.08 54.58Q238.67 58.92 244.17 58.92Z",
} as const;

/**
 * Das Signet: das "o" der Wortmarke, flach gedrückt zum Rundkurs.
 *
 * Bis September 2026 war das hier das "s" der Wortmarke — dieselbe Kontur,
 * nur quadratisch gerahmt. Jetzt ist es das "o", und zwar neu gezeichnet
 * statt gestaucht: eine Schrift gestaucht trifft die waagrechten Partien
 * anders als die senkrechten, die Punze des Fettschnitts fällt dabei fast zu
 * und geht im Kleinen ganz zu. Hier sind es deshalb zwei Ellipsen mit
 * überall grosszügiger Öffnung.
 *
 * Die Bandbreite ist nicht konstant: die Aussparung sitzt 3.5 Einheiten
 * höher als die Aussenkontur, also ist das Band oben 9 Einheiten schmal,
 * an den Seiten 12 und unten 16 breit. Das ist der Fluchtpunkt — die
 * Strecke liegt in der Landschaft statt flach auf dem Papier, und es ist
 * das, was das Zeichen von einem beliebigen Wiederhol-Symbol trennt (die
 * sind rundherum gleich dick).
 *
 * Wichtig für jeden neuen Aufrufer: die Aussparung läuft **gegen** die
 * Aussenkontur (Aussen im Uhrzeigersinn, innen dagegen). Satori und Canvas
 * füllen beide nach der nonzero-Regel, unter der eine gleichläufige
 * Aussparung kein Loch, sondern Fläche wäre. Beim alten "s" stellte sich
 * die Frage nicht, es hatte keine Punze.
 *
 * Der Rahmen ist die tatsächliche Tuschekontur, nicht mehr ein Quadrat —
 * wie bei WORTMARKE oben. Aufrufer geben die Höhe und lassen die Breite
 * über das Seitenverhältnis folgen.
 */
export const SIGNET = {
  breite: 92,
  hoehe: 54,
  viewBox: "0 0 92 54",
  // Breite geteilt durch Höhe — für Aufrufer, die nur eine Höhe kennen.
  seitenverhaeltnis: 1.704,
  pfad:
    "M0 27A46 27 0 1 1 92 27A46 27 0 1 1 0 27ZM12 23.5A34 14.5 0 1 0 80 23.5A34 14.5 0 1 0 12 23.5Z",
} as const;

/**
 * Die Wortmarke als fertiges SVG in einem data:-URI.
 *
 * Gedacht für next/og (Satori), das einen Pfad nur über ein <img> zuverlässig
 * rastert, und für alles andere, was eine Bildquelle statt eines React-Knotens
 * erwartet. Im Markup einer Seite ist components/Wortmarke.tsx die bessere
 * Wahl: das Inline-SVG dort erbt über currentColor die Textfarbe, ein
 * data:-URI trägt seine Farbe fest eingebacken.
 *
 * @param farbe Füllfarbe der Kontur, beliebiger CSS-Farbwert.
 */
export function wortmarkeDataUri(farbe: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORTMARKE.viewBox}"><path fill="${farbe}" d="${WORTMARKE.pfad}"/></svg>`,
  );
}

/**
 * Das Signet — der Rundkurs — als data:-URI.
 *
 * Wie wortmarkeDataUri, nur für die Stellen, an denen der ganze Schriftzug
 * nicht hinpasst: App-Icon und Favicon. Das <img> dort braucht Breite und
 * Höhe im Verhältnis SIGNET.seitenverhaeltnis, sonst verzerrt Satori das
 * Zeichen auf ein Quadrat.
 *
 * @param farbe Füllfarbe der Kontur, beliebiger CSS-Farbwert.
 */
export function signetDataUri(farbe: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SIGNET.viewBox}"><path fill="${farbe}" d="${SIGNET.pfad}"/></svg>`,
  );
}

/**
 * Packt ein SVG-Dokument in einen data:-URI.
 *
 * encodeURIComponent statt base64: das Ergebnis bleibt im Diff lesbar und ist
 * kürzer — base64 bläht jede Datei um ein Drittel auf.
 */
function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
