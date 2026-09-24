import Link from "next/link";
import { SparklesIcon } from "@/components/NavIcons";
import SectionHeading from "@/components/ui/SectionHeading";
import SubmitButton from "@/components/ui/SubmitButton";
import { buttonVariants } from "@/components/ui/Button";
import { premiumKurzform } from "@/lib/premiumVorteile";
import { createPortalSession } from "@/lib/actions/billing";
import { datumCH } from "@/lib/format";
import { betragText, planName } from "@/lib/premiumAngebot";
import type { PremiumStatus } from "@/lib/premiumLimits";

// Plan-Benennung und Datumsformat stehen in lib/, weil die Abschluss-Seite
// (components/PremiumWillkommen.tsx) dasselbe Abo benennt. Standen sie hier,
// gäbe es zwei Zuordnungen für dieselbe Sache — und die eine würde
// irgendwann geändert und die andere nicht. Dort steht auch, warum
// "gruender" bleibt, obwohl der Preis nicht mehr verkauft wird.

// Zeigt den Abo-Zustand so, wie er ist — nicht nur "Premium: ja/nein".
// Eine Kündigung, die bis zum Periodenende weiterläuft, und eine offene
// Zahlung mit Kulanzfrist sind beides Zustände, in denen Premium aktiv ist
// und trotzdem etwas ansteht. Wer das nicht sieht, wird vom Ablauf
// überrascht.
//
// Für Abonnenten eine einzige kompakte Zeile statt eines Stapels: wer
// zahlt, braucht hier keine Werbung, nur den Stand und den Weg ins Portal.
// Nur die Kulanz-Warnung bleibt ein voller Absatz — sie ist die eine
// Information, die nicht klein sein darf.
//
// Welcher Zweig wo erscheint, entscheidet der Aufrufer, und die beiden
// überschneiden sich nicht: der Abonnenten-Zweig läuft nur auf
// app/profil/einstellungen/abo, der Werbe-Zweig nur auf der Profilseite
// (die die Karte mit Abo gar nicht mehr rendert). Abrechnung gehört zu den
// Einstellungen, Werbung nicht.
export default function PremiumCard({
  status,
  wechselHinweis = null,
}: {
  status: PremiumStatus;
  /** Nur auf der Abo-Seite gesetzt: Bestands-Monatsabo, dessen Wechsel
   *  aufs Jahresabo das Kundenportal anbietet (jahresaboWechselHinweis). */
  wechselHinweis?: { ersparnisRappen: number; waehrung: string } | null;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-4">
      <SectionHeading icon={SparklesIcon}>Premium</SectionHeading>

      {status.aktiv ? (
        <>
          {status.inKulanzfrist && status.kulanzBis && (
            <p className="text-sm text-danger">
              Die letzte Zahlung hat nicht geklappt. Premium bleibt noch bis zum{" "}
              {datumCH(status.kulanzBis)} aktiv — bitte hinterleg im Abo-Portal ein gültiges
              Zahlungsmittel.
            </p>
          )}

          {/* Einziges Formular der App, das eine Server Action direkt bindet
              statt über useActionState — der Pending-Zustand kam deshalb
              nirgends her. createPortalSession legt eine Stripe-Portal-Sitzung
              an und leitet weiter; in dieser Zeit blieb der Button bedienbar,
              und ein zweiter Klick erzeugte eine zweite Sitzung. Ausgerechnet
              im Bezahlbereich. */}
          <form action={createPortalSession} className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-foreground">
              Premium
              {status.plan && <> · {planName(status.plan)}</>}
              {/* Der Saisonpass verlängert sich nicht — "verlängert sich am"
                  wäre dort die eine Angabe, die niemand nachprüft und die
                  trotzdem jeder glaubt. Und während der Testphase ist das
                  Datum der Tag der ersten Abbuchung, nicht einer
                  Verlängerung (0110). */}
              {status.quelle === "saisonpass" && status.periodeEndetAm ? (
                <> · <span className="text-muted">gültig bis {datumCH(status.periodeEndetAm)}</span></>
              ) : status.testphaseBis ? (
                <> · <span className="text-muted">gratis bis {datumCH(status.testphaseBis)}</span></>
              ) : status.laeuftAbAm ? (
                <> · <span className="text-muted">Gekündigt — gültig bis {datumCH(status.laeuftAbAm)}.</span></>
              ) : (
                status.periodeEndetAm && (
                  <> · <span className="text-muted">verlängert sich am {datumCH(status.periodeEndetAm)}</span></>
                )
              )}
            </p>
            {/* Mit einem Saisonpass gibt es kein Abo zu verwalten: das
                Kundenportal führt dort nur die Rechnung des Kaufs
                (invoice_creation in lib/actions/billing.ts). Der Knopf sagt
                deshalb, was dahinter steht. */}
            <SubmitButton pendingLabel="Wird geöffnet…" className="shrink-0">
              {status.quelle === "saisonpass"
                ? "Rechnung ansehen"
                : status.inKulanzfrist
                  ? "Zahlungsmittel aktualisieren"
                  : "Abo verwalten"}
            </SubmitButton>
          </form>
          {/* Nur wenn das Portal den Wechsel wirklich anbietet — sonst
              verspräche der Satz einen Weg, den es nicht gibt. */}
          {wechselHinweis && status.quelle === "abo" && (
            <p className="text-xs text-muted">
              Mit dem Jahresabo sparst du{" "}
              {betragText(wechselHinweis.ersparnisRappen, wechselHinweis.waehrung)} pro Jahr — im
              Kundenportal unter «Abo verwalten» wechseln.
            </p>
          )}
          {/* Der Pass läuft aus und niemand erinnert daran — kein Stripe-
              Ereignis, keine Mahnung, keine Kündigung. Der Weg zurück
              gehört deshalb sichtbar hierhin, und zwar leise: ein Abo, das
              jetzt abgeschlossen wird, zahlt erst ab dem Passende. */}
          {status.quelle === "saisonpass" && (
            <Link
              href="/profil/premium"
              className={buttonVariants({ variant: "secondary", size: "sm", className: "self-start" })}
            >
              Premium verlängern
            </Link>
          )}
        </>
      ) : status.offeneZahlung ? (
        // Kulanzfrist vorbei, Zahlung weiterhin offen: Premium ist aus, das
        // Abo lebt bei Stripe weiter. Kein Kauf-Einstieg — ein zweites Abo
        // wiese die Kasse ohnehin ab —, sondern der Weg, das bestehende
        // nachzuzahlen.
        <form action={createPortalSession} className="flex flex-col gap-3">
          <p className="text-sm text-danger">
            Für dein Abo ist eine Zahlung offen, Premium ist deshalb pausiert. Hinterleg im
            Abo-Portal ein gültiges Zahlungsmittel — danach läuft es ohne neues Abo weiter.
          </p>
          <SubmitButton pendingLabel="Wird geöffnet…" className="self-start">
            Zahlungsmittel aktualisieren
          </SubmitButton>
        </form>
      ) : (
        <>
          {/* Eine Zeile plus eine Umriss-Schaltfläche, nicht mehr eine
              Aufzählung plus ein gefüllter Knopf.

              Zwei Gründe, beide aus docs/design-vereinfachung.md Anhang C2.
              Erstens: der gefüllte Akzent gehört den Handlungen des Nutzers
              ("Strecke fahren", "Fahrt speichern"). Ein Verkauf im selben
              Gewicht wie die Kernhandlung ist zu laut für eine Seite, die
              die Selbstdarstellung des Nutzers ist. Zweitens: die Vorteile
              standen hier in einer dritten Kopie neben lib/premiumVorteile.ts
              — und genau diese Kopie ist mit Migration 0086 verrutscht, sie
              warb monatelang mit "Eigene Strecken erstellen", während das
              Erstellen längst wieder kostenlos war.

              Die Kurzform liest jetzt aus derselben Quelle wie die Kaufseite;
              sie kann nicht mehr eigenständig veralten. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-muted">{premiumKurzform()}</p>
            <Link
              href="/profil/premium"
              className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}
            >
              Mehr zu Premium
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
