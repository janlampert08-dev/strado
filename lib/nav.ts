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

  // Abgemeldete Besucher sehen denselben Einstieg. Vorher führte für sie von
  // der Startseite aus überhaupt kein Weg zu einer Fahrt — sie mussten erst
  // von sich aus "Anmelden" wählen, ohne dass irgendwo stand, wofür. Der
  // Klick ist trotzdem keine Sackgasse: /fahrten/neu leitet ohne Session auf
  // /anmelden um (siehe app/fahrten/neu/page.tsx).
  if (!loggedIn) {
    return [
      { href: "/", label: "Strecken", icon: MapPinIcon },
      fahrtStarten,
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
