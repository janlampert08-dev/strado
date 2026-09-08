// Inhalt der TikTok-Slideshows: welche Slides in welcher Reihenfolge.
//
// Die Streckenzahlen kommen aus ../instagram/daten.mjs und werden hier nicht
// noch einmal abgeschrieben — eine zweite Abschrift laeuft beim naechsten
// Streckenwechsel auseinander, und dann widersprechen sich zwei Kanaele.
// Wer in der App eine Strecke ergaenzt oder umbenennt, zieht sie dort nach.
//
// Die Fahrernamen und Zeiten in der Bestenlisten-Slide sind erfunden und
// bleiben es (siehe docs/rechtstexte/datenschutz.md): echte Nutzernamen und
// Fahrten gehoeren niemandem, der ihrer Veroeffentlichung auf einer
// Werbeflaeche zugestimmt hat.
//
// Zu den Beispielzeiten gibt es eine harte Regel, siehe README:
// jede gezeigte Zeit muss auf eine Durchschnittsgeschwindigkeit hinauslaufen,
// die legal fahrbar ist. 17:34 auf 12.3 km sind 42 km/h — das ist der Punkt.

export { STRECKEN } from "../instagram/daten.mjs";

// Die Hooks, die zur Auswahl standen, stehen in captions.md mit Einschaetzung.
// Hier steht nur, welcher tatsaechlich gerendert wird.
export const SLIDESHOWS = [
  {
    id: "01-deine-zeit",
    name: "Deine Zeit auf keiner",
    slides: [
      {
        typ: "hook",
        marker: "Kanton Zürich",
        titel: "Du fährst sie alle.\nUnd kennst deine\nZeit auf keiner.",
        subline: "Sieben vermessene Strecken. Wisch weiter. →",
      },
      { typ: "strecke", strecke: "zberg" },
      { typ: "strecke", strecke: "binzmer" },
      { typ: "strecke", strecke: "nordwest" },
      { typ: "strecke", strecke: "greifensee" },
      { typ: "strecke", strecke: "zsee" },
      {
        typ: "liste",
        strecke: "zberg",
        klasse: "Motorrad",
        fahrer: [["zberg_88", "17:34"], ["pass_driver", "17:52"], ["zooloop_zoe", "18:14"], ["bergziege_b", "18:43"], ["serpentine_s", "19:21"]],
      },
      {
        typ: "cta",
        titel: "Jetzt du.",
        text: "Strecke wählen, fahren, deine Zeit steht in der Liste.",
        fussnote: "Kein App Store. Link auf, losfahren.",
      },
    ],
  },
  {
    id: "02-drei-strassen",
    name: "Drei Strassen",
    slides: [
      {
        typ: "hook",
        marker: "Zürich",
        titel: "Du wohnst seit\nJahren in Zürich.\nUnd kennst drei\nStrassen.",
        subline: "Diese hier bist du noch nie als Strecke gefahren.",
      },
      { typ: "strecke", strecke: "binzmer" },
      { typ: "strecke", strecke: "dietlikon" },
      { typ: "strecke", strecke: "greifensee" },
      { typ: "strecke", strecke: "nordwest" },
      { typ: "strecke", strecke: "a3" },
      {
        typ: "statement",
        marker: "Frage an dich",
        titel: "Welche fehlt?",
        text: "Sieben sind drin. Schreib deine in die Kommentare — Start, Ziel, und warum sie sich lohnt.",
        fussnote: "Die meistgenannte kommt als Nächstes rein.",
      },
      {
        typ: "cta",
        titel: "app.strado.ch",
        text: "Alle Strecken mit Karte, Höhenprofil und Wetter.",
        fussnote: "Läuft im Browser. Kein Download.",
      },
    ],
  },
  {
    id: "03-kennt-nur-einer",
    name: "Kennt nur einer",
    slides: [
      {
        typ: "hook",
        marker: "Kanton Zürich",
        titel: "Die beste Strecke\nim Kanton kennt\ngenau einer.",
        subline: "Und der schickt sie dir nicht.",
      },
      {
        typ: "statement",
        marker: "Warum es Strado gibt",
        titel: "Sie stand nie in\neinem Verzeichnis.",
        text: "Sie stand in Köpfen und in Chatverläufen, die man nach drei Wochen nicht mehr findet.",
        fussnote: "Jetzt stehen sie hier. →",
      },
      { typ: "strecke", strecke: "zberg" },
      { typ: "strecke", strecke: "nordwest" },
      { typ: "strecke", strecke: "binzmer" },
      { typ: "strecke", strecke: "zsee" },
      {
        typ: "liste",
        strecke: "nordwest",
        klasse: "Auto",
        fahrer: [["nordwest_n", "48:12"], ["kombi_kurt", "49:03"], ["rampe_r", "50:27"], ["achtkomma9", "51:44"], ["sonntagsfahrt", "53:10"]],
      },
      {
        typ: "cta",
        titel: "Jetzt weisst du\nes auch.",
        text: "Sieben Strecken im Kanton Zürich, mit Karte, Höhenprofil und Bestenliste.",
        fussnote: "app.strado.ch — kein App Store, kein Download.",
      },
    ],
  },
];
