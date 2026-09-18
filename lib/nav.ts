import type { ComponentType } from "react";
import { MapPinIcon, PlusIcon, PersonIcon, ShieldIcon, FeedIcon, RecordIcon, ChartIcon, RankingIcon } from "@/components/NavIcons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Weitere Pfade, auf denen dieser Eintrag als aktiv gilt.
   *
   * BottomNav markiert einen Eintrag über `pathname.startsWith(href)`.
   * Eine Seite, die als Reiter unter einem Eintrag hängt, aber eine eigene
   * Adresse hat, ist kein Präfix davon — ohne diese Liste wäre unten dann
   * NICHTS hervorgehoben, und auf dem Telefon ist die Leiste der einzige
   * Orientierungsanker.
   *
   * Konkret betrifft das /aktivitaet: es ist der dritte Reiter des Feeds
   * (components/FeedReiter.tsx), aber weiterhin eine eigene Seite.
   *
   * Die Kompensation steht bewusst hier und nicht als Sonderfall in
   * BottomNav: sie gehört in dieselbe Datei wie die Zuordnung, die sie
   * nötig macht — sonst driftet das eine vom anderen weg.
   */
  aktivAuf?: string[];
}

// Einzige Quelle für die Top-Level-Navigation — Header (Desktop) und
// BottomNav (Mobile) rendern beide dieselbe Liste.
//
// FÜNF PLÄTZE, UND WER SIE BEKOMMT
//
// Die mobile Leiste ist auf fünf Einträge gedeckelt (Begründung weiter
// unten bei den Rollen). Was also hineinkommt, verdrängt etwas.
//
// "Ranglisten" steht darin, "Aktivität" nicht — und zwar in genau dieser
// Zuordnung:
//
//   Ranglisten sind ein eigener Bereich. Sie haben eigene Daten (vier
//   Volumenlisten plus die Streckenbestzeiten), einen eigenen Filter
//   (Motorklasse) und einen eigenen Grund, sie zu öffnen: nachsehen, wo man
//   steht. Das ist keine Ansicht auf den Feed, sondern eine Seite neben ihm,
//   und als dritter Reiter einer anderen Seite war sie genau so auffindbar
//   wie ein Eintrag in einem Menü, das man erst öffnen muss.
//
//   Aktivität steht unter dem Feed. Beide beantworten "was ist passiert,
//   seit ich zuletzt geschaut habe" — der Feed für die anderen, die
//   Aktivität für einen selbst. Sie teilen sich deshalb die Reiterleiste
//   (components/FeedReiter.tsx), und der Zähler ungesehener Reaktionen
//   sitzt am Feed-Eintrag, damit er auch dann sichtbar ist, wenn man gerade
//   nicht auf der Aktivitätsseite steht.
//
// Der Loop-Schritt 8 aus AGENTS.md ("eine Reaktion, von der niemand
// erfährt, schliesst den Loop nicht") bleibt damit vertreten: erreichbar in
// einem Tipp auf die Leiste, mit der Zahl daneben. Was er nicht mehr
// braucht, ist eine eigene Spalte — er ist eine Ansicht, kein Ort.
//
// Ein Unterschied bleibt seit dem Aufzeichnen freier Fahrten: die mobile
// Leiste trägt an der mittleren, am leichtesten erreichbaren Position
// "Fahrt starten" und dafür nicht mehr "Erstellen" (sechs Tabs wären auf
// schmalen Geräten zu eng, und der Weg zum Erstellen einer Strecke steht
// ohnehin prominent auf /profil). Der Header ist eine reine Textleiste mit
// horizontalem Überlauf — dort ist Platz für beides, also stehen dort auch
// beide.
export function getNavItems({
  loggedIn,
  moderator,
  creator = false,
  surface = "header",
}: {
  loggedIn: boolean;
  moderator: boolean;
  /** Dem Konto ist mindestens ein Creator-Code zugewiesen (0091). Optional,
   *  weil der Eintrag für die allermeisten Konten gar nicht existiert. */
  creator?: boolean;
  surface?: "header" | "bottom";
}): NavItem[] {
  // Heisst bewusst nach der Absicht ("ich fahre gleich los") statt nach der
  // Mechanik dahinter ("Aufzeichnen", wie dieser Eintrag früher hiess) — das
  // Ziel ist unverändert der Recorder unter /fahrten/neu.
  const fahrtStarten: NavItem = { href: "/fahrten/neu", label: "Fahrt starten", icon: RecordIcon };

  // Abgemeldete Besucher sehen denselben Einstieg — und seit dem Gast-
  // Aufzeichnen führt er nicht mehr auf die Anmeldeseite, sondern direkt in
  // den Recorder: aufzeichnen darf jeder, ein Konto braucht erst das
  // Speichern (siehe app/fahrten/neu/page.tsx und FreeRideForm.tsx).
  //
  // Der Feed steht hier ebenfalls, weil public_fahrten an anon freigegeben
  // ist — er fehlte in dieser Liste nur, wodurch es für Abgemeldete keinen
  // Weg dorthin gab ausser über einen geteilten Link. Das ist genau der
  // Teil des Produkts, der jemanden ohne Konto überzeugen kann. Die
  // Ranglisten sind ebenso öffentlich und stehen aus demselben Grund
  // daneben — sie sind das zweite, was man ohne Konto ansehen kann, und
  // "wer ist hier der Schnellste" ist eine Frage, die man auch ohne Konto
  // hat.
  //
  // "Erstellen", "Profil" und "Aktivität" bleiben weg: alle drei sind ohne
  // Konto nichts als eine Umleitung auf /anmelden. Bei "Aktivität" kommt
  // hinzu, dass es ohne eigene Fahrten und Follower gar keinen Inhalt hätte.
  //
  // Fünf Einträge, wie für Angemeldete — die Deckelung ist die Breite der
  // Leiste, nicht der Anmeldezustand.
  if (!loggedIn) {
    return [
      { href: "/", label: "Strecken", icon: MapPinIcon },
      { href: "/feed", label: "Feed", icon: FeedIcon },
      fahrtStarten,
      { href: "/ranglisten", label: "Ranglisten", icon: RankingIcon },
      { href: "/anmelden", label: "Anmelden", icon: PersonIcon },
    ];
  }

  // Heisst "Erstellen", nicht mehr "Vorschlagen", und bleibt dabei: eine
  // private Strecke entsteht ohne jede Prüfung, nur die öffentliche geht
  // durch die Moderation. Die Begründung stand bis 0086 auf dem Premium-Zwang
  // — der ist zurückgenommen, das Wort passt trotzdem weiter, denn es
  // beschreibt die Handlung und nicht, wer sie ausführen darf. Der
  // Bezeichner bleibt, damit die Tests und der Rest des Codes nicht
  // mitwandern müssen.
  const vorschlagen: NavItem = { href: "/strecken/neu", label: "Erstellen", icon: PlusIcon };
  const mittlereAktionen: NavItem[] =
    surface === "bottom" ? [fahrtStarten] : [fahrtStarten, vorschlagen];

  // Die beiden Rollen-Einträge. Sie stehen NUR im Header.
  //
  // Vorher hingen sie in beiden Surfaces, mit der Begründung, wer seine
  // Zahlen ansehen wolle, tue das eher auf dem Telefon. Das stimmt — nur
  // war der Preis dafür eine mobile Leiste mit sechs Einträgen für einen
  // Moderator und sieben für ein Konto, das beides ist. Derselbe Kommentar,
  // der zwei Absätze weiter oben "sechs Tabs wären auf schmalen Geräten zu
  // eng" festhält und deshalb "Erstellen" aus der Leiste nimmt, liess hier
  // eine siebte Spalte zu: bei 360 px Breite sind das 51 px pro Eintrag,
  // schmaler als die 44 px Mindestgrösse einer Tippfläche plus Abstand, und
  // die Beschriftungen ("Ranglisten", "Moderation") brechen oder werden
  // abgeschnitten.
  //
  // Die Leiste ist damit für JEDES Konto fünf Einträge breit. Der mobile Weg
  // zu den Rollen liegt jetzt dort, wo auch "Erstellen" gelandet ist: auf
  // /profil, in einem Abschnitt, den app/profil/page.tsx unter md einblendet
  // — also genau dort, wo diese Leiste die Textnavigation des Headers
  // ersetzt.
  const rollen: NavItem[] = [
    ...(creator ? [{ href: "/creator", label: "Creator", icon: ChartIcon }] : []),
    ...(moderator ? [{ href: "/moderation", label: "Moderation", icon: ShieldIcon }] : []),
  ];

  return [
    { href: "/", label: "Strecken", icon: MapPinIcon },
    // aktivAuf: /aktivitaet ist der dritte Reiter dieses Eintrags, hat aber
    // eine eigene Adresse — ohne die Angabe stünde man dort vor einer
    // Leiste, in der nichts hervorgehoben ist.
    { href: "/feed", label: "Feed", icon: FeedIcon, aktivAuf: ["/aktivitaet"] },
    ...mittlereAktionen,
    { href: "/ranglisten", label: "Ranglisten", icon: RankingIcon },
    { href: "/profil", label: "Profil", icon: PersonIcon },
    ...(surface === "bottom" ? [] : rollen),
  ];
}

/**
 * Die Rollen-Einträge allein — für app/profil/page.tsx, das sie unter md
 * anbietet, weil getNavItems sie der mobilen Leiste vorenthält.
 *
 * Eigene Funktion statt einer zweiten Liste in der Seite: welche Rolle zu
 * welchem Pfad und welchem Symbol gehört, soll an einer Stelle stehen.
 */
export function getRollenItems({
  moderator,
  creator = false,
}: {
  moderator: boolean;
  creator?: boolean;
}): NavItem[] {
  return getNavItems({ loggedIn: true, moderator, creator, surface: "header" }).filter(
    (item) => item.href === "/creator" || item.href === "/moderation",
  );
}
