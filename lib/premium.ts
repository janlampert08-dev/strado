import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { BESTAND_VARIABLEN, preisIdsAus } from "@/lib/stripeWebhook";
import { passZeitraum } from "@/lib/premiumAngebot";
import { zahlungNochOffen } from "@/lib/offeneZahlung";
import { throwOnQueryError } from "@/lib/queryError";
import {
  MAX_PRIVATE_STRECKEN_GRATIS,
  type AboPlanKennung,
  type PremiumStatus,
  type PrivateStreckenKontingent,
} from "@/lib/premiumLimits";

// Die einzige Antwort auf "darf diese Person X?".
//
// Vorher stand die Frage als blankes profiles.ist_premium an vielen Stellen
// herum. Das Boolean weiss nicht, ob gekündigt wurde, wann die Periode
// endet oder ob eine Zahlung offen ist — und wer es einzeln abfragt, baut
// jedes Mal seine eigene, leicht abweichende Regel.
//
// SERVER-ONLY: dieses Modul zieht über lib/supabase/server.ts auch
// next/headers herein. Die Grenzwerte und Typen liegen deshalb in
// lib/premiumLimits.ts, wo Client Components sie holen können — von hier
// werden sie nur weitergereicht, damit Server-Code einen Import braucht
// statt zwei.
export * from "@/lib/premiumLimits";

const KEIN_PREMIUM: PremiumStatus = {
  aktiv: false,
  plan: null,
  quelle: null,
  laeuftAbAm: null,
  periodeEndetAm: null,
  testphaseBis: null,
  inKulanzfrist: false,
  kulanzBis: null,
  offeneZahlung: false,
  gratisBis: null,
};

function datum(wert: string | null): Date | null {
  if (!wert) return null;
  const d = new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Die Zuordnung Preis-ID zu Plan lebt in serverseitigen
// Umgebungsvariablen — dieselbe Quelle, aus der lib/actions/billing.ts beim
// Abschluss die Preis-ID nimmt. Bewusst nicht anhand des Betrags geraten:
// ein Preis kann sich ändern, die ID nicht.
function planAusPreisId(preisId: string | null): AboPlanKennung | null {
  if (!preisId) return null;
  if (preisId === process.env.STRIPE_PREMIUM_PRICE_ID_JAHR) return "jahr";
  // Bestandsabos nach einer Preisänderung — siehe BESTAND_VARIABLEN in
  // lib/stripeWebhook.ts. Wer zum alten Preis weiterzahlt, hat trotzdem ein
  // Jahres- bzw. Monatsabo und soll es so benannt sehen.
  if (preisIdsAus(BESTAND_VARIABLEN.jahr).includes(preisId)) return "jahr";
  if (preisIdsAus(BESTAND_VARIABLEN.monat).includes(preisId)) return "monat";
  // Nur noch für Bestandsabos: der Gründerpreis wird seit 2026-09-07 nicht
  // mehr verkauft, aber wer ihn hat, behält ihn — und soll ihn im Profil
  // unter seinem Namen sehen, nicht als "Jahresabo".
  if (preisId === process.env.STRIPE_PREMIUM_PRICE_ID_GRUENDER) return "gruender";
  if (
    preisId === process.env.STRIPE_PREMIUM_PRICE_ID_MONAT ||
    preisId === process.env.STRIPE_PREMIUM_PRICE_ID
  ) {
    return "monat";
  }
  // Eine unbekannte Preis-ID heisst nicht "kein Abo" — sie heisst nur, dass
  // wir den Plan nicht benennen können (etwa nach einem Katalogwechsel).
  // Der Zugang hängt am Status, nicht an dieser Zuordnung.
  return null;
}

// Status gilt als laufend — dieselbe Regel wie subscription_ist_premium()
// in 0059, hier für die ANZEIGE gespiegelt.
//
// Die Berechtigung selbst entscheidet weiterhin die Datenbank über
// profiles.ist_premium. Liefen beide auseinander, gewönne ist_premium —
// deshalb wird unten die Abo-Zeile UND das Profil-Flag gelesen, statt die
// Regel hier noch einmal eigenständig zu entscheiden.
function statusIstLaufend(status: string): boolean {
  return status === "active" || status === "trialing";
}

// Mit React cache() umschlossen: eine Seite fragt den Status oft mehrfach
// (Layout, Card, Gate), das soll eine Abfrage pro Request bleiben.
//
// Liest über den an die Session gebundenen Client, also unter RLS — die
// Policy aus 0063 gibt genau die eigene Zeile frei, und der Spalten-Grant
// hält die Stripe-Kennungen heraus. Kein Service-Role-Client: eine
// Berechtigungsfrage über den RLS-Bypass zu beantworten hiesse, die
// Schranke genau dort aufzugeben, wo sie zählt.
export const getPremiumStatus = cache(async function getPremiumStatus(): Promise<PremiumStatus> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return KEIN_PREMIUM;

  const [
    { data: profil, error: profilError },
    { data: abo, error: aboError },
    { data: pass, error: passError },
  ] = await Promise.all([
    supabase.from("profiles").select("ist_premium").eq("id", user.id).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, price_id, current_period_end, cancel_at_period_end, kulanz_bis")
      .eq("user_id", user.id)
      .maybeSingle(),
    // ALLE noch nicht abgelaufenen Pässe, nicht nur der längste. Nach einer
    // Verlängerung sind es zwei, und sie beantworten zwei verschiedene
    // Fragen: einer deckt HEUTE ab, der andere — mit einem gueltig_ab in der
    // Zukunft, weil apply_saisonpass ihn hinten anhängt — sagt, bis WANN
    // insgesamt bezahlt ist.
    //
    // Der frühere Zuschnitt nahm nur den spätesten und prüfte an ihm, ob er
    // gerade läuft. Genau nach einer Verlängerung war das falsch: der
    // späteste beginnt erst später, "läuft gerade" war damit false, und der
    // Zugang galt als von Hand gesetzt — ohne Datum, ohne Rechnung, und ohne
    // den Weg zurück auf die Kaufseite, deren Ausnahme an
    // quelle === "saisonpass" hängt. Wer verlängert hatte, war bis zum
    // Ablauf des ERSTEN Passes ausgesperrt.
    //
    // Fünf Zeilen reichen: mehr gleichzeitig gültige Pässe kann niemand
    // kaufen, solange die Kaufseite erst in den letzten 30 Tagen verlängern
    // lässt. Der Grant aus 0110 lässt die Stripe-Kennungen aussen vor.
    supabase
      .from("saisonpaesse")
      .select("gueltig_ab, gueltig_bis")
      .eq("user_id", user.id)
      .is("erstattet_am", null)
      .gt("gueltig_bis", new Date().toISOString())
      .order("gueltig_bis", { ascending: false })
      .limit(5),
  ]);

  // Ein Lesefehler ist kein "nichts da". Ohne diese drei Zeilen wurde aus
  // einem Timeout oder einem PostgREST-Fehler auf profiles ein data = null
  // und daraus aktiv = false: ein zahlendes Konto galt als Gratis-Konto,
  // ohne dass irgendwo etwas schiefzugehen schien.
  //
  // Das kostet mehr als eine falsche Anzeige. logTrackedCompletion und
  // logFreeRide schneiden die Fotoliste auf maxFotosProFahrt(await
  // istPremium()) zu — bei einem Lesefehler also auf 6 statt 12, still,
  // nachdem das Formular mit maxPhotos={12} gerendert hatte. Die Fahrt ist
  // danach gespeichert und der Upload nicht wiederholbar: sechs Bilder sind
  // weg, und niemand hat eine Fehlermeldung gesehen.
  //
  // Die beiden anderen Abfragen tragen den Zugang nicht (der haengt an der
  // Projektion), sie benennen ihn — Plan, Periodenende, Kuendigungsstand.
  // Faellt eine aus, zeigte die Seite einem Abonnenten "von Hand gesetzt,
  // kein Datum" und verbarg die Kuendigungsmoeglichkeit. Auch das ist eine
  // Tatsachenbehauptung ueber einen Ausfall, also ebenfalls werfen.
  //
  // Dieselbe Unterscheidung macht zugangsgeschichte() in
  // lib/actions/billing.ts ausdruecklich, und lib/queryError.ts ist dafuer
  // da. Der Preis ist bewusst: die Premium-, Profil-, Streckendetail- und
  // Neue-Fahrt-Seiten zeigen bei einem Lesefehler die Fehlerseite, statt
  // stillschweigend auf "kein Abo" zurueckzufallen.
  throwOnQueryError(profilError, "Premium-Status");
  throwOnQueryError(aboError, "Abo");
  throwOnQueryError(passError, "Saisonpass");

  // profiles.ist_premium ist die massgebliche Projektion: sie wird in
  // derselben Transaktion geschrieben wie die Abo-Zeile (0059) bzw. der
  // Pass (0110) und deckt zusätzlich den Fall ab, dass Premium ohne beides
  // von Hand gesetzt wurde.
  const aktiv = profil?.ist_premium === true;

  // Läuft gerade einer, und bis wann reicht die Kette? Die Auswertung steht
  // in lib/premiumAngebot.ts, damit sie geprüft werden kann (Vitest kennt
  // nur lib/).
  const { laeuft: passLaeuft, deckungBis: passBis } = passZeitraum(pass ?? []);

  const aboLaeuft = abo ? statusIstLaufend(abo.status) : false;

  // Ein laufender Pass benennt den Zugang, auch wenn daneben schon ein Abo
  // steht: dieses Abo ist dann eines, das erst mit dem Passende zu zahlen
  // beginnt ("anschluss", in Stripe als Testphase bis zum Passende). Wer
  // "Jahresabo · Testphase" läse, würde glauben, er teste gerade gratis.
  if (aktiv && passLaeuft && passBis) {
    return {
      ...KEIN_PREMIUM,
      aktiv,
      plan: "saisonpass",
      quelle: "saisonpass",
      laeuftAbAm: aboLaeuft ? null : passBis,
      periodeEndetAm: passBis,
    };
  }

  // Premium ohne laufendes Abo und ohne laufenden Pass: entweder das
  // Gratis-Premium aus dem Signup-Link (0121) oder von Hand gesetzt. Beides
  // sah bis 0135 gleich aus ("manuell"), und das sperrte die Promo-Konten
  // aus den Kaufseiten aus — genau die, die der Link zum Kauf führen soll.
  //
  // Nur in diesem Fall gefragt, nicht bei jedem Aufruf: für alle anderen
  // Konten kostet das keinen zusätzlichen Weg zur Datenbank.
  if (aktiv && !aboLaeuft) {
    const gratisBis = await gratisPremiumBis(supabase);
    if (gratisBis) {
      return {
        ...KEIN_PREMIUM,
        aktiv,
        quelle: "gratis",
        laeuftAbAm: gratisBis,
        periodeEndetAm: gratisBis,
        gratisBis,
      };
    }
  }

  if (!abo) {
    // Premium ohne Abo-Zeile, ohne Pass und ohne Gratis: von Hand gesetzt,
    // oder die Zeile wurde bei einer Kontolöschung entfernt. Kein Plan, kein
    // Periodenende — aber der Zugang gilt.
    return { ...KEIN_PREMIUM, aktiv, quelle: aktiv ? "manuell" : null };
  }

  const kulanzBis = datum(abo.kulanz_bis);
  const inKulanzfrist =
    !statusIstLaufend(abo.status) && kulanzBis !== null && kulanzBis.getTime() > Date.now();
  const periodeEndetAm = datum(abo.current_period_end);

  return {
    aktiv,
    plan: planAusPreisId(abo.price_id),
    quelle: aktiv ? "abo" : null,
    laeuftAbAm: abo.cancel_at_period_end ? periodeEndetAm : null,
    periodeEndetAm,
    // Während der Testphase ist current_period_end bei Stripe das Ende der
    // Testphase — die erste Abbuchung.
    testphaseBis: abo.status === "trialing" ? periodeEndetAm : null,
    inKulanzfrist,
    kulanzBis: inKulanzfrist ? kulanzBis : null,
    // Dieselbe Regel wie die Kaufsperre in lib/actions/billing.ts: wer dort
    // wegen einer offenen Zahlung abgewiesen wird, muss hier den Weg ins
    // Portal finden (app/profil/einstellungen/abo).
    offeneZahlung: zahlungNochOffen(abo.status, periodeEndetAm ? periodeEndetAm.getTime() : null),
    gratisBis: null,
  };
});

// Ende des eigenen, gerade laufenden Gratis-Premiums — oder null.
//
// premium_gratis selbst ist für authenticated weder lesbar noch per Policy
// freigegeben (0121); premium_gratis_bis() (0135) gibt als SECURITY
// DEFINER genau diese eine Zahl für auth.uid() heraus. Kein
// Service-Role-Client: dieselbe Abwägung wie oben bei getPremiumStatus.
//
// Anders als die drei Abfragen oben wirft ein Fehler hier NICHT. Das
// Gratis-Premium trägt den Zugang nicht (der hängt an ist_premium), es
// benennt ihn nur — und fällt die Abfrage aus, ist das bisherige Verhalten
// ("manuell": Zugang gilt, keine Kaufseite) die sichere Seite. Vor allem
// aber läuft der Code damit schon, bevor 0135 eingespielt ist: die
// unbekannte Funktion landet genau hier.
async function gratisPremiumBis(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Date | null> {
  const { data, error } = await supabase.rpc("premium_gratis_bis");
  if (error) {
    console.warn("Gratis-Premium nicht lesbar (0135 eingespielt?):", error.message);
    return null;
  }
  const bis = datum(typeof data === "string" ? data : null);
  return bis && bis.getTime() > Date.now() ? bis : null;
}

/** Kurzform für Aufrufer, die nur das Ja/Nein brauchen. */
export async function istPremium(): Promise<boolean> {
  return (await getPremiumStatus()).aktiv;
}

// Die Entscheidung fällt in der Datenbank (darf_private_strecke_anlegen,
// Migration 0064), nicht hier: sie zählt die vorhandenen Strecken und liest
// die Bestandsschutz-Markierung in einem Aufruf und damit konsistent. Eine
// App-seitige Zählung wäre ein Wettlauf — zwei gleichzeitige Anfragen sähen
// beide dieselbe Zahl und kämen beide durch.
export async function privateStreckenKontingent(): Promise<PrivateStreckenKontingent> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const gesperrt: PrivateStreckenKontingent = {
    erlaubt: false,
    vorhanden: 0,
    grenze: MAX_PRIVATE_STRECKEN_GRATIS,
    grund: "kontingent_erschoepft",
  };

  if (!user) return gesperrt;

  const { data, error } = await supabase.rpc("darf_private_strecke_anlegen");
  if (error || !data || data.length === 0) return gesperrt;

  const zeile = data[0];
  return {
    erlaubt: zeile.erlaubt,
    vorhanden: zeile.vorhanden,
    grenze: zeile.grenze,
    grund: zeile.grund as PrivateStreckenKontingent["grund"],
  };
}
