import type { ComponentType } from "react";
import { MapPinIcon, PlusIcon, RankingIcon, PersonIcon, ShieldIcon, FeedIcon, RecordIcon, ChartIcon } from "@/components/NavIcons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// Einzige Quelle für die Top-Level-Navigation — Header (Desktop) und
// BottomNav (Mobile) rendern beide dieselbe Liste.
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
  // Feed und Bestenlisten stehen hier ebenfalls, weil beide Seiten ohnehin
  // öffentlich lesbar sind (public_fahrten bzw. die Leaderboard-Views sind
  // an anon freigegeben) — sie fehlten in dieser Liste nur, wodurch es für
  // Abgemeldete keinen Weg dorthin gab ausser über einen geteilten Link.
  // Das ist genau der Teil des Produkts, der jemanden ohne Konto überzeugen
  // kann. "Erstellen" und "Profil" bleiben weg: beide sind ohne Konto
  // nichts als eine Umleitung auf /anmelden.
  if (!loggedIn) {
    return [
      { href: "/", label: "Strecken", icon: MapPinIcon },
      { href: "/feed", label: "Feed", icon: FeedIcon },
      fahrtStarten,
      { href: "/leaderboards", label: "Bestenlisten", icon: RankingIcon },
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
  // die Beschriftungen ("Bestenlisten", "Moderation") brechen oder werden
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
    { href: "/feed", label: "Feed", icon: FeedIcon },
    ...mittlereAktionen,
    { href: "/leaderboards", label: "Bestenlisten", icon: RankingIcon },
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
