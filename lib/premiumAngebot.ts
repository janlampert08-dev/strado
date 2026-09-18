// Rechnende und formatierende Anteile der Kaufseite: Beträge ausschreiben,
// den Jahrespreis auf einen Monat herunterbrechen und den Vorteil gegenüber
// zwölf Monatszahlungen beziffern.
//
// Warum in lib/ und nicht in der Komponente: Vitest läuft mit
// environment: "node", jeder Test liegt unter lib/ (AGENTS.md) — Logik, die
// in einer Komponente steht, ist in diesem Projekt schlicht nicht prüfbar.
// Und die Zahlen hier sind keine Kosmetik: "34 % günstiger" ist eine
// Preisaussage auf einer Kaufseite und muss zum tatsächlich abgebuchten
// Betrag passen.
//
// Alle Beträge sind Rappen (bzw. die kleinste Einheit der jeweiligen
// Währung), genau wie Stripe sie führt. Gerechnet wird ausschliesslich mit
// dem, was getPremiumAngebot() aus Stripe gelesen hat — nie mit einer
// zweiten Preisliste im Code.
import {
  SAISONPASS_MONATE,
  SAISONPASS_VERLAENGERBAR_TAGE_VOR_ABLAUF,
  type AboPlan,
  type AboPlanKennung,
  type PlanAngebot,
} from "./premiumLimits";

/** Anzeigename des Plans — von der Planauswahl und der Zahlungsseite geteilt,
 *  damit beide denselben Titel für denselben Plan zeigen. */
export function planTitel(plan: AboPlan): string {
  switch (plan) {
    case "monat":
      return "Monatlich";
    case "jahr":
      return "Jährlich";
    case "saisonpass":
      return "Saisonpass";
  }
}

/**
 * Name eines ABGESCHLOSSENEN Abos — nicht zu verwechseln mit planTitel()
 * darüber, und deshalb bewusst eine andere Vokabel: vor dem Kauf wählt man
 * zwischen "Monatlich" und "Jährlich", danach hat man ein "Monatsabo" oder
 * ein "Jahresabo". Beides ist richtig, keines ersetzt das andere.
 *
 * Geteilt von components/PremiumCard.tsx (Profilseite) und
 * components/PremiumWillkommen.tsx (Abschluss-Seite): wer nach der Zahlung
 * "Jahresabo" liest, soll es im Profil wiederfinden. Zwei Kopien derselben
 * Zuordnung würden genau das irgendwann brechen.
 *
 * "gruender" bleibt, obwohl der Preis seit 2026-09-07 nicht mehr verkauft
 * wird: die Gründer-Abos laufen weiter und sollen weiterhin beim Namen
 * genannt werden.
 */
export function planName(plan: AboPlanKennung): string {
  switch (plan) {
    case "monat":
      return "Monatsabo";
    case "jahr":
      return "Jahresabo";
    case "gruender":
      return "Jahresabo zum Gründerpreis";
    case "saisonpass":
      return "Saisonpass";
  }
}

/** Zeitraum-Zusatz neben dem Betrag ("pro Monat" / "pro Jahr"), ebenfalls
 *  von Planauswahl und Zahlungsseite geteilt. */
export function planZeitraum(plan: AboPlan): string {
  switch (plan) {
    case "monat":
      return "pro Monat";
    case "jahr":
      return "pro Jahr";
    case "saisonpass":
      return `einmalig für ${SAISONPASS_MONATE} Monate`;
  }
}

/**
 * Schreibt einen Betrag in der kleinsten Einheit als Währungsbetrag aus.
 *
 * Wie viele kleinste Einheiten auf eine ganze gehen, ist nicht überall 100:
 * der Yen kennt keine Nachkommastelle, der Bahrain-Dinar drei. Eine fest
 * verdrahtete 100 zeigte für einen Stripe-Preis in JPY den hundertsten Teil
 * des Betrags an — auf einer Kaufseite ein falsch ausgezeichneter Preis.
 * Der Teiler kommt deshalb aus derselben Locale-Datenbank, die den Betrag
 * gleich darauf formatiert; für CHF ist das unverändert 100.
 */
export function betragText(betrag: number, waehrung: string): string {
  const format = new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: waehrung.toUpperCase(),
  });
  // ?? 2, weil die Typdefinition die Angabe als optional führt. Praktisch
  // liefert jede Laufzeit mit vollständigen Locale-Daten sie; bleibt sie
  // einmal aus, ist der Zweistellen-Fall der richtige Rückfall — er trifft
  // CHF, die einzige Währung, in der Strado heute Preise führt.
  const stellen = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(betrag / 10 ** stellen);
}

/**
 * Der Jahresbetrag auf einen Monat gerechnet — die Zahl, die den Jahresplan
 * mit dem Monatsplan vergleichbar macht. Bewusst gerundet und nur als
 * Nebenzeile ("entspricht …") ausgewiesen: abgebucht wird der Jahresbetrag,
 * nicht dieser Wert.
 */
export function monatsAequivalentRappen(jahresBetragRappen: number): number {
  return Math.round(jahresBetragRappen / 12);
}

/**
 * Wie viel Prozent der Jahresplan gegenüber zwölf Monatszahlungen spart.
 *
 * null, sobald die Aussage nicht sicher stimmt: fehlender Plan, verschiedene
 * Währungen (ein Vergleich über Währungsgrenzen wäre eine erfundene Zahl)
 * oder ein Jahrespreis, der gar nicht günstiger ist. Die Kaufseite zeigt das
 * Abzeichen dann einfach nicht, statt eine Ersparnis zu behaupten.
 */
export function jahresVorteilProzent(
  monat: PlanAngebot | undefined,
  jahr: PlanAngebot | undefined,
): number | null {
  if (!monat || !jahr) return null;
  if (monat.waehrung.toUpperCase() !== jahr.waehrung.toUpperCase()) return null;
  const zwoelfMonate = monat.betragRappen * 12;
  if (zwoelfMonate <= 0 || jahr.betragRappen >= zwoelfMonate) return null;
  return Math.round((1 - jahr.betragRappen / zwoelfMonate) * 100);
}

/**
 * Darf ein laufender Saisonpass jetzt verlängert werden?
 *
 * Ohne laufenden Pass immer. Mit Pass erst in den letzten
 * SAISONPASS_VERLAENGERBAR_TAGE_VOR_ABLAUF Tagen: der neue Pass schliesst
 * zwar an den alten an und verschluckt nichts (apply_saisonpass), aber wer
 * im Juni einen zweiten kauft, hat sich fast sicher vertippt.
 */
export function saisonpassVerlaengerbar(bis: Date | null, jetzt: Date = new Date()): boolean {
  if (!bis || bis.getTime() <= jetzt.getTime()) return true;
  const grenze = SAISONPASS_VERLAENGERBAR_TAGE_VOR_ABLAUF * 24 * 60 * 60 * 1000;
  return bis.getTime() - jetzt.getTime() <= grenze;
}

/**
 * Der Saisonpass auf einen Monat gerechnet — nur für die Nebenzeile auf der
 * Kaufseite, damit er neben Monats- und Jahresabo vergleichbar wird.
 */
export function saisonpassMonatsAequivalentRappen(betragRappen: number): number {
  return Math.round(betragRappen / SAISONPASS_MONATE);
}

/**
 * Was eine Reihe von Saisonpässen über den Zugang aussagt.
 *
 * Erwartet die Zeilen, die weder erstattet noch abgelaufen sind (so fragt
 * lib/premium.ts sie ab), und beantwortet zwei Fragen getrennt:
 *
 * - `laeuft`: Deckt einer davon den jetzigen Moment? Nur dann trägt der Pass
 *   den Zugang gerade.
 * - `deckungBis`: Bis wann reicht die Kette? Nach einer Verlängerung ist das
 *   das Ende des SPÄTEREN Passes, auch wenn der erst später beginnt — denn
 *   genau bis dahin ist bezahlt.
 *
 * Beides auseinanderzuhalten ist der Punkt: ein verlängerter Pass beginnt in
 * der Zukunft (apply_saisonpass hängt ihn an das Ende des laufenden), und wer
 * "läuft gerade" an ihm prüft, bekommt false für jemanden, der bezahlt hat.
 *
 * Verglichen wird über Date.parse statt als Zeichenkette: ein Zeitstempel aus
 * PostgREST kann "+00:00" oder einen lokalen Versatz tragen, einer aus
 * toISOString() trägt ".000Z" — lexikografisch liegen solche Vergleiche um
 * Stunden daneben.
 */
export function passZeitraum(
  paesse: { gueltig_ab: string; gueltig_bis: string }[],
  jetzt: Date = new Date(),
): { laeuft: boolean; deckungBis: Date | null } {
  const ms = jetzt.getTime();
  let laeuft = false;
  let deckungBis: number | null = null;

  for (const pass of paesse) {
    const ab = Date.parse(pass.gueltig_ab);
    const bis = Date.parse(pass.gueltig_bis);
    if (Number.isNaN(ab) || Number.isNaN(bis)) continue;
    if (bis <= ms) continue;
    if (ab <= ms) laeuft = true;
    if (deckungBis === null || bis > deckungBis) deckungBis = bis;
  }

  return { laeuft, deckungBis: laeuft && deckungBis !== null ? new Date(deckungBis) : null };
}
