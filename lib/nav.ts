import type { ComponentType } from "react";
import { MapPinIcon, PlusIcon, PersonIcon, ShieldIcon, FeedIcon, RecordIcon, ChartIcon, FlameIcon } from "@/components/NavIcons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Weitere Pfade, auf denen dieser Eintrag als aktiv gilt.
   *
   * Nötig geworden durch den Tausch weiter unten: BottomNav markiert einen
   * Eintrag über `pathname.startsWith(href)`, und seit /leaderboards kein
   * eigener Eintrag mehr ist, ist es auch kein Präfix eines verbliebenen —
   * wer auf dem Feed "Rangliste" tippt, stand danach auf einer Seite, auf
   * der unten NICHTS hervorgehoben war. Auf dem Telefon ist die Leiste der
   * einzige Orientierungsanker.
   *
   * Die Kompensation steht bewusst hier und nicht als Sonderfall in
   * BottomNav: sie gehört in dieselbe Datei wie der Tausch, der sie nötig
   * macht — sonst driftet das eine vom anderen weg.
   */
  aktivAuf?: string[];
}

// Einzige Quelle für die Top-Level-Navigation — Header (Desktop) und
// BottomNav (Mobile) rendern beide dieselbe Liste.
//
// JEDER EINTRAG IST EIN SCHRITT DES KERNLOOPS (siehe AGENTS.md). Das war
// nicht immer so, und der Tausch, der es hergestellt hat, ist der Kern von
// docs/design-vereinfachung.md, Abschnitt 3b:
//
//   raus: "Bestenlisten". Der Eintrag kam in keinem der neun Schritte vor
//         und hielt trotzdem einen der fünf Plätze. Die Rangliste je Strecke
//         sitzt ohnehin auf der Streckenseite (RouteLeaderboardPreview), wo
//         sie zu Schritt 1 gehört; die globale erreicht man jetzt als
//         dritten Reiter neben dem Feed (components/FeedReiter.tsx) — dort,
//         wo man sowieso schaut, was andere gefahren sind.
//
//   rein: "Aktivität". Das IST Schritt 8, der die Schleife schliesst, und es
//         war der einzige Loop-Schritt ohne Platz in der Leiste — erreichbar
//         nur über ein 20-px-Flammensymbol oben rechts im Kopf. AGENTS.md
//         schreibt zu diesem Schritt: "eine Reaktion, von der niemand
//         erfährt, schliesst den Loop nicht." Die Navigation widersprach
//         dem Satz.
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
  // Bestenlisten sind ebenso öffentlich und ebenso erreichbar — als Reiter
  // neben dem Feed, statt als eigener Eintrag.
  //
  // "Erstellen", "Profil" und "Aktivität" bleiben weg: alle drei sind ohne
  // Konto nichts als eine Umleitung auf /anmelden.
  if (!loggedIn) {
    return [
      { href: "/", label: "Strecken", icon: MapPinIcon },
      { href: "/feed", label: "Feed", icon: FeedIcon, aktivAuf: ["/leaderboards"] },
      fahrtStarten,
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
    { href: "/feed", label: "Feed", icon: FeedIcon, aktivAuf: ["/leaderboards"] },
    ...mittlereAktionen,
    { href: "/aktivitaet", label: "Aktivität", icon: FlameIcon },
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
