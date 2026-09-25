// Dünne Re-Export-Wrapper um lucide-react (siehe NavIcons.tsx) statt der
// bisherigen handgezeichneten Inline-SVGs.
import { Globe, Lock, UsersRound } from "lucide-react";
import type { Sichtbarkeit } from "@/lib/sichtbarkeit";

export { Globe as GlobeIcon, Lock as LockIcon, UsersRound as FollowerIcon };

// Das Symbol zur Stufe (lib/sichtbarkeit.ts): Schloss, Personen, Globus.
// UsersRound statt Users, weil Users schon der Feed-Reiter ist (NavIcons).
export function SichtbarkeitIcon({
  sichtbarkeit,
  className,
}: {
  sichtbarkeit: Sichtbarkeit;
  className?: string;
}) {
  const Icon =
    sichtbarkeit === "oeffentlich" ? Globe : sichtbarkeit === "follower" ? UsersRound : Lock;
  return <Icon className={className} aria-hidden="true" />;
}
