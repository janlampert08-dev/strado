// Inhalt der ersten Instagram-Posts: Streckendaten und Slide-Definitionen.
//
// Die Streckenzahlen sind dieselben, die die Info-Seite zeigt (stradoinfo,
// index.html, Momentaufnahme der freigegebenen Strecken aus public.routes vom
// 2026-09-07). Wer in der App eine Strecke ergaenzt oder umbenennt, muss sie
// hier nachziehen — dieses Verzeichnis hat keine Verbindung zur Datenbank.
//
// Die Fahrernamen und Zeiten in der Bestenlisten-Slide sind erfunden und
// bleiben es, aus demselben Grund wie auf der Info-Seite: echte Nutzernamen
// und Fahrten gehoeren niemandem, der ihrer Veroeffentlichung auf einer
// Werbeflaeche zugestimmt hat (siehe docs/rechtstexte/datenschutz.md).

export const STRECKEN = {
  a3: {
    name: "A3 Asphalt", region: "Zürich", start: "Zürich", ziel: "Pfäffikon SZ", rund: false,
    laenge: "33.1 km", hoehe: "608 m", steigung: "3.6%", kehren: "0",
    profil: [[0,414],[2.53,429],[4.64,468],[7.24,501],[9.79,548],[12.7,606],[15.07,574],[18.92,560],[22.56,595],[25.29,518],[27.95,517],[30.06,482],[32.23,460],[33.12,428]],
  },
  binzmer: {
    name: "Binzmer Backfire", region: "Maur", start: "Maur", ziel: "Maur", rund: true,
    laenge: "10.7 km", hoehe: "626 m", steigung: "8%", kehren: "5",
    profil: [[0,455],[1.28,454],[2.51,444],[2.74,447],[3.8,446],[4.3,458],[5.04,514],[5.56,552],[6.49,598],[7.32,626],[8.19,609],[9.24,568],[10.25,488],[10.75,455]],
  },
  dietlikon: {
    name: "Dietlikon Dash", region: "Zürich", start: "Dietlikon", ziel: "Dietlikon", rund: true,
    laenge: "5.7 km", hoehe: "477 m", steigung: "4.4%", kehren: "3",
    profil: [[0,473],[0.21,477],[0.5,469],[1.06,473],[1.59,461],[2.03,454],[2.52,450],[2.96,446],[3.22,443],[3.29,442],[3.58,446],[3.89,458],[4.26,467],[4.7,470],[5,468],[5.46,472],[5.65,473]],
  },
  flughafen: {
    name: "Flughafen Loop", region: "Zürich", start: "Oberglatt ZH", ziel: "Oberglatt ZH", rund: true,
    laenge: "22.5 km", hoehe: "445 m", steigung: "3.7%", kehren: "9",
    profil: [[0,432],[2.46,424],[3.17,421],[6.52,426],[9.13,441],[10.34,432],[11.06,437],[12.07,438],[13.45,437],[14.35,430],[15.63,424],[17.43,421],[19.49,421],[21.41,423],[22.46,432]],
  },
  greifensee: {
    name: "Greifensee Schleife", region: "Zürich", start: "Fällanden", ziel: "Fällanden", rund: true,
    laenge: "18.7 km", hoehe: "462 m", steigung: "1.9%", kehren: "3",
    profil: [[0,454],[1.5,447],[4.09,454],[4.64,462],[6.33,451],[8.01,438],[8.46,438],[9.51,440],[10.61,445],[11.53,445],[13.45,438],[15.36,438],[17.25,441],[18.38,447],[18.69,454]],
  },
  nordwest: {
    name: "Nordwestschleife", region: "Zürich", start: "Zürich", ziel: "Zürich", rund: true,
    laenge: "38.5 km", hoehe: "783 m", steigung: "8.9%", kehren: "3",
    profil: [[0,414],[2.72,427],[5.04,751],[7.62,520],[11.87,531],[16.29,397],[18.67,404],[23.35,451],[26.78,471],[29.73,423],[31.8,431],[35.5,423],[36.84,408],[38.35,414],[38.5,414]],
  },
  zberg: {
    name: "Zürichberg Zeit", region: "Zürich", start: "Zürich Zoo", ziel: "Zürich Zoo", rund: true,
    laenge: "12.3 km", hoehe: "667 m", steigung: "8.8%", kehren: "5",
    profil: [[0,629],[1.28,617],[2.4,667],[2.92,650],[3.97,569],[4.94,486],[5.96,440],[6.37,438],[7.03,435],[7.67,439],[8.74,513],[9.65,583],[10.69,594],[11.45,608],[12.27,629]],
  },
  zsee: {
    name: "Zürichsee Run", region: "Zürich", start: "Zürich", ziel: "Zürich", rund: true,
    laenge: "65.7 km", hoehe: "424 m", steigung: "1.6%", kehren: "1",
    profil: [[0,408],[6.35,408],[12.72,409],[13.86,422],[18.43,409],[24.15,408],[28.29,408],[34.51,408],[40.63,409],[46.79,408],[50.78,411],[56.76,412],[63.12,408],[65.72,408]],
  },
};

// Reihenfolge der Strecken im Eroeffnungs-Karussell: erst die nahe, bekannte
// (Zoo), dann die kurvige, dann die harte — die lange Seerunde zum Schluss,
// weil sie die Zahl ist, die haengen bleibt.
const KARUSSELL = ["zberg", "binzmer", "nordwest", "greifensee", "dietlikon", "a3", "zsee"];

export const POSTS = [
  {
    id: "01-sieben-strecken",
    name: "Karussell — Sieben Strecken",
    slides: [
      { typ: "cover", eyebrow: "Zürich", titel: "Sieben Strecken.\nEin Kanton.\nAlle vermessen.",
        subline: "Länge, Kehren, Steigung, Höhenprofil — wisch durch." },
      ...KARUSSELL.map((k) => ({ typ: "strecke", strecke: k })),
      { typ: "statement", eyebrow: "Und jetzt du", titel: "Such dir eine aus.",
        text: "Alle sieben liegen in der App — mit Karte, Höhenprofil, Wetter und Bestenliste.",
        fussnote: "Läuft im Browser. Kein Download." },
    ],
  },
  {
    id: "02-zuerichberg-zeit",
    name: "Strecke des Tages — Zürichberg Zeit",
    slides: [{ typ: "strecke", strecke: "zberg", pille: "Strecke des Tages" }],
  },
  {
    id: "03-nordwestschleife",
    name: "Strecke des Tages — Nordwestschleife",
    slides: [{ typ: "strecke", strecke: "nordwest", pille: "Strecke des Tages" }],
  },
  {
    id: "04-zuerichsee-run",
    name: "Strecke des Tages — Zürichsee Run",
    slides: [{ typ: "strecke", strecke: "zsee", pille: "Strecke des Tages" }],
  },
  {
    id: "05-fahrzeugklassen",
    name: "Karussell — Bestenlisten je Fahrzeugklasse",
    slides: [
      { typ: "statement", eyebrow: "Bestenlisten", titel: "Ein Töff gehört nicht\nin dieselbe Liste\nwie ein Kombi.",
        text: "Deshalb hat jede Strecke bei Strado eine Bestenliste pro Fahrzeugklasse.",
        fussnote: "Wisch für ein Beispiel →" },
      { typ: "liste", strecke: "zberg", klasse: "Motorrad",
        fahrer: [["zberg_88", "17:34"], ["pass_driver", "17:52"], ["zooloop_zoe", "18:14"], ["bergziege_b", "18:43"], ["serpentine_s", "19:21"]] },
      { typ: "statement", eyebrow: "Fair vergleichen", titel: "Gegen die, die\ndasselbe fahren.",
        text: "Filter nach Fahrzeugklasse — deine Zeit steht neben Zeiten, mit denen sie etwas zu tun hat.",
        fussnote: "Jede Strecke, jede Klasse." },
    ],
  },
  {
    id: "06-reel-cover",
    name: "Reel — Cover (Ein Ride in 20 Sekunden)",
    slides: [
      { typ: "cover", eyebrow: "In 20 Sekunden", titel: "Strecke finden.\nFahren.\nVergleichen.",
        subline: "So sieht eine Fahrt in Strado aus." },
    ],
  },
  {
    id: "07-kein-app-store",
    name: "Statement — Kein App Store",
    slides: [
      { typ: "statement", eyebrow: "Keine Installation", titel: "Kein App Store.\nLink auf, losfahren.",
        text: "Strado läuft direkt im Browser — auf iPhone, Android und am Rechner. Zum Homescreen hinzufügen geht trotzdem.",
        fussnote: "Strecke vorher laden, dann geht’s auch ohne Empfang." },
    ],
  },
  {
    id: "08-welche-strecke-fehlt",
    name: "Frage — Welche Strecke fehlt?",
    slides: [
      { typ: "statement", eyebrow: "Frage an euch", titel: "Welche Strecke\nfehlt uns noch?",
        text: "Sieben sind drin. Schreib deine in die Kommentare — mit Start, Ziel und warum sie sich lohnt.",
        fussnote: "Die meistgenannte kommt als Nächstes rein." },
    ],
  },
  {
    id: "09-warum",
    name: "Gründer — Warum es Strado gibt",
    slides: [
      { typ: "statement", eyebrow: "Warum es Strado gibt", titel: "Die gute Strecke\nkannte immer\nnur einer.",
        text: "Jede Ausfahrt fing mit derselben Frage an: wo fahren wir hin? Die Antwort steckte in Köpfen und Chatverläufen — nirgends, wo man sie findet.",
        fussnote: "Deshalb Strado." },
    ],
  },
];
