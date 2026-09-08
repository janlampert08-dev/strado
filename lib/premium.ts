import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
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
  laeuftAbAm: null,
  periodeEndetAm: null,
  inKulanzfrist: false,
  kulanzBis: null,
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

  const [{ data: profil }, { data: abo }] = await Promise.all([
    supabase.from("profiles").select("ist_premium").eq("id", user.id).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, price_id, current_period_end, cancel_at_period_end, kulanz_bis")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // profiles.ist_premium ist die massgebliche Projektion: sie wird in
  // derselben Transaktion geschrieben wie die Abo-Zeile (0059) und deckt
  // zusätzlich den Fall ab, dass Premium ohne Abo von Hand gesetzt wurde.
  const aktiv = profil?.ist_premium === true;

  if (!abo) {
    // Premium ohne Abo-Zeile: von Hand gesetzt, oder die Zeile wurde bei
    // einer Kontolöschung entfernt. Kein Plan, kein Periodenende — aber der
    // Zugang gilt.
    return { ...KEIN_PREMIUM, aktiv };
  }

  const kulanzBis = datum(abo.kulanz_bis);
  const inKulanzfrist =
    !statusIstLaufend(abo.status) && kulanzBis !== null && kulanzBis.getTime() > Date.now();
  const periodeEndetAm = datum(abo.current_period_end);

  return {
    aktiv,
    plan: planAusPreisId(abo.price_id),
    laeuftAbAm: abo.cancel_at_period_end ? periodeEndetAm : null,
    periodeEndetAm,
    inKulanzfrist,
    kulanzBis: inKulanzfrist ? kulanzBis : null,
  };
});

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
