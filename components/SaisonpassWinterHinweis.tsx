import { SAISONPASS_MONATE } from "@/lib/premiumLimits";

// Der Satz zum Saisonpass im Winterhalbjahr (lib/saisonpassSaison.ts) —
// geteilt von der Planauswahl, der Zahlungsseite und /premium, damit er
// überall gleich lautet. Bewusst in text-foreground statt muted: er ist
// keine Fussnote, sondern die eine Angabe, die den Kauf im Oktober
// verändert.
export default function SaisonpassWinterHinweis() {
  return (
    <span className="text-xs text-foreground">
      Gilt ab Kauf {SAISONPASS_MONATE} Monate — im Winter sind die meisten Pässe zu. Für die
      nächste Saison: ab März kaufen oder Jahresabo.
    </span>
  );
}
