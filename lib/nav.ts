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

  return [
    { href: "/", label: "Strecken", icon: MapPinIcon },
    { href: "/feed", label: "Feed", icon: FeedIcon },
    ...mittlereAktionen,
    { href: "/leaderboards", label: "Bestenlisten", icon: RankingIcon },
    { href: "/profil", label: "Profil", icon: PersonIcon },
    // Wie die Moderation ein Eintrag, den fast niemand sieht — und aus
    // demselben Grund in beiden Surfaces: wer seine Zahlen ansehen will,
    // tut das eher auf dem Telefon als am Schreibtisch. Für ein Konto ohne
    // Code ändert sich nichts, für eines mit Code wird die Leiste so lang
    // wie sie es für Moderatoren längst ist.
    ...(creator ? [{ href: "/creator", label: "Creator", icon: ChartIcon }] : []),
    ...(moderator ? [{ href: "/moderation", label: "Moderation", icon: ShieldIcon }] : []),
  ];
}
