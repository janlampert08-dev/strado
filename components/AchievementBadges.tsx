import type { ComponentType } from "react";
import { Compass, Mountain, TrendingUp } from "lucide-react";
import Card from "@/components/ui/Card";
import { mitAnzahl } from "@/lib/format";
import {
  FAHRTEN_MILESTONES,
  HOEHENMETER_MILESTONES,
  highestMilestone,
  PASS_MILESTONES,
} from "@/lib/achievements";

interface Badge {
  icon: ComponentType<{ className?: string }>;
  label: string;
}

// Reine Darstellung bereits auf der Seite berechneter Zahlen (passCount/
// hoehenmeter/trackedRides.length aus app/profil/page.tsx) — keine neuen
// Queries, keine an Premium gekoppelte Freischaltung. Zeigt je Kategorie nur
// die höchste erreichte Schwelle, damit die Kachelreihe klein bleibt.
export default function AchievementBadges({
  passCount,
  hoehenmeter,
  fahrtenCount,
}: {
  passCount: number;
  hoehenmeter: number;
  fahrtenCount: number;
}) {
  const badges: Badge[] = [];

  const passMilestone = highestMilestone(passCount, PASS_MILESTONES);
  if (passMilestone !== null) {
    badges.push({ icon: Mountain, label: mitAnzahl(passMilestone, "Pass", "Pässe") });
  }

  const hoehenmeterMilestone = highestMilestone(hoehenmeter, HOEHENMETER_MILESTONES);
  if (hoehenmeterMilestone !== null) {
    badges.push({ icon: TrendingUp, label: `${hoehenmeterMilestone.toLocaleString("de-CH")} Höhenmeter` });
  }

  const fahrtenMilestone = highestMilestone(fahrtenCount, FAHRTEN_MILESTONES);
  if (fahrtenMilestone !== null) {
    badges.push({ icon: Compass, label: mitAnzahl(fahrtenMilestone, "Fahrt", "Fahrten") });
  }

  if (badges.length === 0) {
    return (
      <p className="text-sm text-muted">
        Noch keine Auszeichnungen — die erste Fahrt eintragen, um loszulegen.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {badges.map((badge) => (
        <Card
          key={badge.label}
          surface
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium"
        >
          <badge.icon className="h-4 w-4 text-accent" aria-hidden="true" />
          {badge.label}
        </Card>
      ))}
    </div>
  );
}
