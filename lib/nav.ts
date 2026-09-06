import type { ComponentType } from "react";
import { MapPinIcon, PlusIcon, RankingIcon, PersonIcon, ShieldIcon, FeedIcon, RecordIcon } from "@/components/NavIcons";

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
// "Fahrt starten" und dafür nicht mehr "Vorschlagen" (sechs Tabs wären auf
// schmalen Geräten zu eng, und der Weg zum Streckenvorschlag steht ohnehin
// prominent auf /profil). Der Header ist eine reine Textleiste mit
// horizontalem Überlauf — dort ist Platz für beides, also stehen dort auch
// beide.
export function getNavItems({
  loggedIn,
  moderator,
  surface = "header",
}: {
  loggedIn: boolean;
  moderator: boolean;
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
  // kann. "Vorschlagen" und "Profil" bleiben weg: beide sind ohne Konto
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

  const vorschlagen: NavItem = { href: "/strecken/neu", label: "Vorschlagen", icon: PlusIcon };
  const mittlereAktionen: NavItem[] =
    surface === "bottom" ? [fahrtStarten] : [fahrtStarten, vorschlagen];

  return [
    { href: "/", label: "Strecken", icon: MapPinIcon },
    { href: "/feed", label: "Feed", icon: FeedIcon },
    ...mittlereAktionen,
    { href: "/leaderboards", label: "Bestenlisten", icon: RankingIcon },
    { href: "/profil", label: "Profil", icon: PersonIcon },
    ...(moderator ? [{ href: "/moderation", label: "Moderation", icon: ShieldIcon }] : []),
  ];
}
