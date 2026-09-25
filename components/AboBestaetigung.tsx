"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PremiumWillkommen from "@/components/PremiumWillkommen";
import Button, { buttonVariants } from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import {
  confirmCheckoutSession,
  confirmSubscription,
  meldeCheckoutProblem,
  pruefeCheckoutErgebnis,
} from "@/lib/actions/billing";
import type { AboPlan } from "@/lib/premiumLimits";
import { fehlerMeldung } from "@/lib/checkoutFehler";
import { EINZELVERSUCH, WARTEZEITEN_MS } from "@/lib/abobremse";

// Die Bestätigung nach der Rückkehr von einer Weiterleitungs-Zahlung.
//
// Warum das hier im Browser läuft und nicht im Render der Seite: die
// Bestätigung schreibt (profiles.ist_premium und die Abo-Zeile über
// apply_subscription_state) und ruft danach revalidatePath(). Beides sind
// Mutationen, und Next.js verbietet sie im Render ausdrücklich —
// "revalidatePath during render which is unsupported" ist keine Warnung,
// sondern ein geworfener Fehler. Genau daran ist diese Seite am 2026-09-08
// gescheitert: die Zahlung ging durch, der Abo-Zustand wurde geschrieben,
// und danach brach das Rendern ab. Wer bezahlt hatte, sah eine Fehlerseite.
//
// Server Actions sind der von Next.js vorgesehene Ort für solche Mutationen
// (node_modules/next/dist/docs/01-app/02-guides/data-security.md,
// "Avoiding side-effects during rendering") — von hier aufgerufen sind
// confirmCheckoutSession/confirmSubscription genau das.
//
// Der zweite Gewinn ist die gefühlte Geschwindigkeit: die Seite steht
// sofort, statt dass der Browser nach der Rückkehr von TWINT auf eine Kette
// aus Supabase-, Stripe- und Datenbank-Aufrufen wartet, bevor überhaupt
// etwas erscheint.

// Der Wiederhol-Takt steht in lib/abobremse.ts, zusammen mit der Bremse in
// lib/actions/billing.ts, gegen die er bemessen ist. Beides gehört
// zusammen: wer hier enger taktet, verschiebt den schlimmsten ehrlichen Fall
// nach oben — und dort schlägt dann der Test an, statt dass jemand nach
// einer TWINT-Zahlung ohne Premium dasteht.

function warte(ms: number): Promise<void> {
  return new Promise((fertig) => setTimeout(fertig, ms));
}

// "offen": nicht bestätigt, aber womöglich unterwegs. "fehlgeschlagen":
// Stripe sagt ausdrücklich, dass diese Zahlung nicht zustande kam (abgelehnt
// oder Session abgelaufen) — siehe lib/checkoutErgebnis.ts. Nur dann darf die
// Seite "nicht abgeschlossen" sagen; im Zweifel bleibt es bei "offen".
type Zustand = "prueft" | "bestaetigt" | "offen" | "fehlgeschlagen";

export default function AboBestaetigung({
  sitzung,
  abo,
}: {
  /** Checkout-Session aus der return_url (der reguläre Weg). */
  sitzung: string | null;
  /** Abo-ID aus dem vorherigen Payment-Intent-Fluss — siehe
   *  confirmSubscription in lib/actions/billing.ts. */
  abo: string | null;
}) {
  const router = useRouter();
  const [zustand, setZustand] = useState<Zustand>("prueft");
  // Der Plan der gescheiterten Session, für den Weg zurück aufs
  // Bezahlformular. Kommt vom Server (Session-Metadaten), nicht aus der URL.
  const [plan, setPlan] = useState<AboPlan | null>(null);
  // Verhindert einen zweiten Durchlauf, solange einer läuft — sowohl beim
  // doppelt ausgeführten Effekt im Entwicklungsmodus als auch beim hektisch
  // getippten "Erneut prüfen".
  const laeuft = useRef(false);
  const abgemeldet = useRef(false);

  useEffect(() => {
    abgemeldet.current = false;
    void schleife(WARTEZEITEN_MS);
    return () => {
      abgemeldet.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function einVersuch(): Promise<boolean> {
    try {
      if (sitzung) return await confirmCheckoutSession(sitzung);
      if (abo) return await confirmSubscription(abo);
      return false;
    } catch (err) {
      // Hier ist bereits Geld geflossen — ein Fehler an dieser Stelle darf
      // nicht spurlos bleiben. Die Schleife läuft trotzdem weiter: ein
      // abgerissener Aufruf ist genau der Fall, den der nächste Versuch
      // auffängt.
      void meldeCheckoutProblem(
        sitzung ?? abo ?? "",
        "bestaetigung",
        fehlerMeldung(err),
      ).catch(() => {});
      return false;
    }
  }

  // Nach einem erfolglosen Versuch: ist die Zahlung sicher gescheitert?
  // Nur für den regulären Weg (Checkout-Session); der Übergangsweg über die
  // Abo-ID kennt diese Unterscheidung nicht und bleibt beim alten Verhalten.
  // Ein Fehler hier ist kein Befund — dann wird einfach weiter geprüft.
  async function sicherGescheitert(): Promise<boolean> {
    if (!sitzung) return false;
    try {
      const antwort = await pruefeCheckoutErgebnis(sitzung);
      if (antwort.ergebnis !== "fehlgeschlagen") return false;
      setPlan(antwort.plan);
      return true;
    } catch {
      return false;
    }
  }

  async function schleife(wartezeiten: readonly number[]) {
    if (laeuft.current) return;
    laeuft.current = true;
    setZustand("prueft");

    try {
      for (const wartezeit of wartezeiten) {
        if (wartezeit > 0) await warte(wartezeit);
        if (abgemeldet.current) return;

        if (await einVersuch()) {
          if (abgemeldet.current) return;
          setZustand("bestaetigt");
          // Die Seite neu vom Server holen: dann rendert sie den Zweig mit
          // dem tatsächlichen Abo-Zustand (Plan, Periodenende) — und der
          // Gruss unten steht währenddessen schon.
          //
          // Die Sitzungs-ID bleibt bewusst in der Adresszeile stehen. Sie ist
          // kein Geheimnis (jede Bestätigung bindet sie serverseitig an den
          // eigenen Customer, siehe istEigeneBezahlteSession), und wer die
          // Seite später neu lädt, kommt damit erneut durch die Prüfung,
          // statt auf eine Seite ohne Bezug zu seiner Zahlung zu treffen.
          router.refresh();
          return;
        }

        // Eine abgelehnte TWINT-Zahlung wird nicht mehr bezahlt, egal wie
        // lange diese Seite wartet. Sie bis zum Ende der Leiter als
        // "unterwegs" zu führen, hiess: eine halbe Minute Warten auf nichts,
        // und danach der Satz "geht nichts verloren" statt "versuch es
        // nochmals".
        if (await sicherGescheitert()) {
          if (!abgemeldet.current) setZustand("fehlgeschlagen");
          return;
        }
      }
      if (!abgemeldet.current) setZustand("offen");
    } finally {
      laeuft.current = false;
    }
  }

  if (zustand === "bestaetigt") {
    // Ohne Abo-Angaben: die kommen mit dem Server-Render, das router.refresh()
    // gerade angestossen hat. Der Gruss selbst wartet nicht darauf.
    return <PremiumWillkommen status={null} />;
  }

  if (zustand === "prueft") {
    return (
      <div className="flex flex-col items-center gap-6 text-center" aria-busy="true">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex w-full flex-col items-center gap-3">
          <h1 className="text-title font-semibold">Zahlung wird bestätigt…</h1>
          <p role="status" aria-live="polite" className="text-sm text-muted">
            Das dauert einen Moment — bei TWINT manchmal ein paar Sekunden länger. Bleib einfach
            auf dieser Seite.
          </p>
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (zustand === "fehlgeschlagen") {
    // Zurück aufs Bezahlformular desselben Plans: createCheckoutSession
    // nimmt dort die noch offene Session wieder auf (oder legt eine neue an,
    // wenn sie abgelaufen ist) — ein zweiter Versuch ist also derselbe Kauf,
    // kein zweiter. Ohne bekannten Plan zur Planauswahl.
    const zurueck = plan ? `/profil/premium/zahlung?plan=${plan}` : "/profil/premium";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-display font-semibold">Zahlung nicht abgeschlossen</h1>
        <p role="alert" className="text-sm text-muted">
          Die Zahlung wurde abgelehnt oder abgebrochen — abgebucht wurde nichts. Versuch es
          nochmals, gern auch mit einer anderen Zahlungsart.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={zurueck} className={buttonVariants({ size: "sm" })}>
            Nochmals versuchen
          </Link>
          <Link href="/profil" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Zum Profil
          </Link>
        </div>
      </div>
    );
  }

  // Nicht bestätigt heisst nicht "fehlgeschlagen": die Verbuchung kann noch
  // laufen, und der Webhook zieht den Zustand ohnehin nach. Deshalb kein
  // Fehlerbild, sondern ein Zwischenstand mit einem Weg weiter — und
  // ausdrücklich der Hinweis, dass nichts doppelt abgebucht wird, weil genau
  // das die Sorge in diesem Moment ist.
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display font-semibold">Zahlung wird noch geprüft</h1>
      <p className="text-sm text-muted">
        Deine Zahlung ist unterwegs, aber noch nicht bestätigt. Bei TWINT dauert das manchmal einen
        Moment. Versuch es gleich noch einmal — abgebucht wird nichts doppelt.
      </p>
      {/* Bewusst keine Zusage, die wir nicht halten können ("es wird nichts
          abgebucht"): ist die Zahlung bei Stripe durch, ist sie durch. Was
          wir zusagen können, ist die Nachführung — der Webhook und der
          nächtliche Abgleich ziehen den Zustand auch dann nach, wenn diese
          Prüfung hier nicht mehr zum Zug kommt. */}
      <p className="text-sm text-muted">
        Bleibt es dabei, geht nichts verloren: Der Abo-Zustand wird auch nachträglich automatisch
        nachgezogen, und du findest ihn jederzeit in deinem Profil.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void schleife(EINZELVERSUCH)}>
          Erneut prüfen
        </Button>
        <Link href="/profil" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Zum Profil
        </Link>
      </div>
    </div>
  );
}
