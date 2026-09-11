// Dünne Re-Export-Wrapper um lucide-react (siehe package.json) statt der
// bisherigen handgezeichneten Inline-SVGs — gleicher { className }-Vertrag,
// gleiche Importnamen, damit lib/nav.ts und alle Konsumenten unverändert
// bleiben. lucide-react ist tree-shakeable (Einzel-Imports), daher kein
// Bundle-Size-Nachteil ggü. den bisherigen 5 Icons.
export { MapPin as MapPinIcon, Trophy as RankingIcon, User as PersonIcon, Plus as PlusIcon, ShieldCheck as ShieldIcon, Users as FeedIcon, Circle as RecordIcon } from "lucide-react";

// Kein Nav-Icon, steht aber hier, weil AGENTS.md → Stack genau diese Datei
// (neben VisibilityIcons.tsx) als Ort für den Wrapper nennt und eine dritte
// Wrapper-Datei für ein einzelnes Icon schlimmer wäre. Genutzt von
// components/PremiumBadge.tsx.
export { Sparkles as SparklesIcon } from "lucide-react";

// Ebenfalls kein Nav-Icon, aus demselben Grund hier: der Leerzustand der
// Creator-Links unter /moderation/creator.
export { Link2 as LinkIcon } from "lucide-react";
