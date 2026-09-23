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

// Ebenso: der Leerzustand des Feedback-Abschnitts unter /moderation und,
// daneben im Kopf derselben Seite, der Link ins Postfach.
export { MessageSquare as FeedbackIcon, Mail as MailIcon } from "lucide-react";

// Und ebenso: die Premium-Auswertung im Statistik-Block der Profilseite
// (components/FahrtStatistik.tsx). Die Profilseite importiert ihre übrigen
// Icons historisch direkt aus lucide-react; für neuen Code verlangt
// AGENTS.md diesen Wrapper, deshalb steht dieses eine hier und nicht dort.
export { BarChart3 as ChartIcon } from "lucide-react";

// Die Flamme der Aktivität. Sie sass einmal fest in components/Header.tsx
// als direkter lucide-Import, war danach kurz das Icon eines eigenen
// Nav-Eintrags, und ist jetzt beides nicht mehr: "Aktivität" ist ein Reiter
// des Feeds (components/FeedReiter.tsx, lib/nav.ts), und eine Reiterleiste
// trägt Text, keine Symbole.
//
// Sie bleibt trotzdem hier und heisst AktivitaetIcon (weiter unten) —
// dieselbe Flamme, gebraucht vom Leerzustand der Aktivitätsliste. Ein
// zweiter Alias FlameIcon auf dasselbe Symbol stand daneben, solange die
// Navigation ihn brauchte; ohne Abnehmer ist er nur ein zweiter Name für
// eine Sache, und genau das hat dieser Datei schon einmal einen falschen
// Kommentar eingetragen (siehe RankingIcon oben).

// Ebenfalls kein Nav-Icon: die Sterne-Bewertung einer Strecke
// (components/Sterne.tsx, components/SterneEingabe.tsx). Steht aus demselben
// Grund hier wie die übrigen — AGENTS.md nennt diese Datei als den Ort für
// den Wrapper, und eine eigene Datei für ein Symbol wäre schlimmer.
export { Star as SternIcon } from "lucide-react";

// Ebenfalls kein Nav-Icon: der Leerzustand der Aktivitätsliste
// (components/ActivityList.tsx). Dasselbe Zeichen, das die Kopfleiste als
// Einstieg in /aktivitaet zeigt.
export { Flame as AktivitaetIcon } from "lucide-react";

// Ebenfalls kein Nav-Icon: der Streifen "Aufzeichnung unterbrochen" unter
// dem Kopf (components/OffeneAufzeichnung.tsx) zeigt damit, dass er ein Weg
// zurück ist und keine blosse Meldung.
export { ChevronRight as WeiterIcon } from "lucide-react";

// Ebenfalls kein Nav-Icon: der Schliessen-Knopf im Kopf von ui/Dialog.
export { X as SchliessenIcon } from "lucide-react";

// Die Pässe: der Berg als Abschnittsmarke (/paesse, Profil), der Haken als
// Stempel einer befahrenen Passhöhe, der Kalender für den Sperrkalender.
// Aus demselben Grund hier wie alles Übrige — AGENTS.md nennt diese Datei
// als den Ort für lucide-Wrapper, und drei Symbole verdienen keine vierte
// Datei.
export {
  Mountain as BergIcon,
  Check as HakenIcon,
  CalendarDays as KalenderIcon,
} from "lucide-react";

// Ebenfalls kein Nav-Icon: das Wetterfenster auf der Streckenseite
// (components/Wetterfenster.tsx). Ein Symbol je Grund aus
// lib/wetterfenster.ts, nicht je Wettercode — die Zelle soll sagen, warum
// ein Tag gut oder schlecht ist, nicht das Wetterbild nachzeichnen. Kälte
// und Glätte teilen sich das Thermometer; der Unterschied steht im Text.
export {
  Sun as WetterTrockenIcon,
  CloudDrizzle as WetterSchauerIcon,
  CloudRain as WetterRegenIcon,
  CloudLightning as WetterGewitterIcon,
  Snowflake as WetterSchneeIcon,
  ThermometerSnowflake as WetterKaltIcon,
  Wind as WetterWindIcon,
} from "lucide-react";

// Ebenfalls kein Nav-Icon: die Pass-Sammlung im Kennzahlen-Block der
// Profilseite (components/PassSammlung.tsx) — der Berg als Zeichen für "Pass",
// nicht für Höhe allgemein.
export { Mountain as PassIcon } from "lucide-react";

// Das Wartungsheft (0111): der Schraubenschlüssel für den Abschnitt und
// seinen Leerzustand, der Kalender für die MFK. Zwei Zeichen, weil die
// Fahrzeugseite zwei Dinge nebeneinander zeigt — das Heft (was war) und die
// Termine (was kommt) — und ein Symbol für beide den Unterschied einzöge.
export { Wrench as WartungIcon, CalendarClock as TerminIcon } from "lucide-react";

// Auto und Motorrad. Beide Zeichen stehen schon in components/VehicleGrid.tsx
// und app/profil/page.tsx, dort aber als direkter lucide-Import aus der Zeit
// vor dieser Wrapper-Regel. Neuer Code (app/profil/fahrzeuge/[id]) nimmt sie
// von hier; das Raster mitzuziehen wäre eine Änderung ohne Anlass.
// Seit 2026-09-23 das Motorrad (Motorbike) statt des Fahrrads (Bike): auf
// der Kachel "Motorrad" der Einrichtung las sich das Fahrrad als Fehler.
export { Car as AutoIcon, Motorbike as MotorradIcon } from "lucide-react";

// Die Stoppuhr vor einer gemessenen Dauer (Bestzeit-Streifen der
// Streckenseite) — damit "14:12 min" nicht als Uhrzeit gelesen wird.
export { Timer as TimerIcon } from "lucide-react";

// Die Hinweise vor der ersten Fahrt (components/ErsteFahrtHinweise.tsx):
// dasselbe Telefon, das FreeRideForm und LiveTrackingForm neben "Bildschirm
// an lassen" zeigen — dort noch als direkter Import aus der Zeit vor dieser
// Regel.
export { Smartphone as TelefonIcon } from "lucide-react";

// Das Teilen-Symbol von iOS (Kasten mit Pfeil nach oben), in der Anleitung
// "Zum Home-Bildschirm" (components/NachDerFahrt.tsx): wer es sucht, sucht
// genau diese Form in der Safari-Leiste.
export { Share as TeilenIcon } from "lucide-react";
