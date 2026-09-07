import Link from "next/link";
import { createPortalSession } from "@/lib/actions/billing";
import type { PremiumStatus } from "@/lib/premiumLimits";

function datum(d: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

const PLAN_NAME: Record<NonNullable<PremiumStatus["plan"]>, string> = {
  monat: "Monatsabo",
  jahr: "Jahresabo",
  gruender: "Jahresabo zum Gründerpreis",
};

// Zeigt den Abo-Zustand so, wie er ist — nicht nur "Premium: ja/nein".
// Eine Kündigung, die bis zum Periodenende weiterläuft, und eine offene
// Zahlung mit Kulanzfrist sind beides Zustände, in denen Premium aktiv ist
// und trotzdem etwas ansteht. Wer das nicht sieht, wird vom Ablauf
// überrascht.
export default function PremiumCard({ status }: { status: PremiumStatus }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-4">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Premium</h2>

      {status.aktiv ? (
        <>
          <p className="text-sm text-foreground">
            {status.plan ? `Du unterstützt Strado mit dem ${PLAN_NAME[status.plan]}.` : "Du bist Premium-Mitglied."}
          </p>

          {status.inKulanzfrist && status.kulanzBis && (
            <p className="text-sm text-danger">
              Die letzte Zahlung hat nicht geklappt. Premium bleibt noch bis zum{" "}
              {datum(status.kulanzBis)} aktiv — bitte hinterleg im Abo-Portal ein gültiges
              Zahlungsmittel.
            </p>
          )}

          {status.laeuftAbAm ? (
            <p className="text-sm text-muted">
              Gekündigt. Premium bleibt bis zum {datum(status.laeuftAbAm)} aktiv; danach werden keine
              Inhalte gelöscht — private Strecken, Fahrten und Fotos bleiben erhalten.
            </p>
          ) : (
            status.periodeEndetAm && (
              <p className="text-sm text-muted">
                Verlängert sich automatisch am {datum(status.periodeEndetAm)}.
              </p>
            )
          )}

          <form action={createPortalSession}>
            <button
              type="submit"
              className="self-start rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:border-border-strong"
            >
              Abo verwalten
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Entdecken, Aufzeichnen und Bestenlisten bleiben kostenlos. Premium hebt Grenzen an —
            unbegrenzt private Strecken, mehr Fotos pro Fahrt, Offline ohne Limit und ein
            Gold-Abzeichen, wenn du magst.
          </p>
          <Link
            href="/profil/premium"
            className="self-start rounded-full border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform duration-fast active:scale-95 hover:opacity-90"
          >
            Strado unterstützen
          </Link>
        </>
      )}
    </section>
  );
}
