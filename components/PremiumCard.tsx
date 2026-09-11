import Link from "next/link";
import SubmitButton from "@/components/ui/SubmitButton";
import { createPortalSession } from "@/lib/actions/billing";
import { datumCH } from "@/lib/format";
import { planName } from "@/lib/premiumAngebot";
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
export default function PremiumCard({ status }: { status: PremiumStatus }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-4">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Premium</h2>

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
              {status.laeuftAbAm ? (
                <> · <span className="text-muted">Gekündigt — gültig bis {datumCH(status.laeuftAbAm)}.</span></>
              ) : (
                status.periodeEndetAm && (
                  <> · <span className="text-muted">verlängert sich am {datumCH(status.periodeEndetAm)}</span></>
                )
              )}
            </p>
            <SubmitButton pendingLabel="Wird geöffnet…" className="shrink-0">
              Abo verwalten
            </SubmitButton>
          </form>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Eigene Strecken erstellen, 12 Fotos pro Fahrt, Offline ohne Limit, GPX-Export.
          </p>
          <Link
            href="/profil/premium"
            className="self-start rounded-full border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform duration-fast active:scale-95 hover:opacity-90"
          >
            Premium holen
          </Link>
        </>
      )}
    </section>
  );
}
