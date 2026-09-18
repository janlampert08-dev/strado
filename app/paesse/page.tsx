import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import PaesseListe, { type PassEintrag } from "@/components/PaesseListe";
import { buttonVariants } from "@/components/ui/Button";
import { getFeedStand, getPaesseMitStatus, HOCHALPIN_AB_M } from "@/lib/paesse";
import { getCurrentUser } from "@/lib/supabase/server";
import { mitAnzahl } from "@/lib/format";

// Die öffentliche Passseite: der Katalog, sein heutiger Zustand, und — für
// angemeldete Konten — die eigene Sammlung.
//
// Sie ist neben der Streckenseite die zweite Seite, die ein Nicht-Nutzer
// sinnvoll geteilt bekommen kann ("welche Pässe sind offen?"), und deshalb
// indexierbar. Dynamisch gerendert, weil die Stempel am Konto hängen.

export const metadata: Metadata = {
  title: "Pässe der Schweiz – Strado",
  description:
    "Alle Passhöhen der Schweiz mit aktuellem Status, üblicher Wintersperre und geplanten Sperrungen — und welche du schon gefahren bist.",
  alternates: { canonical: "/paesse" },
};

export default async function PaessePage() {
  const [paesse, feedStand, user] = await Promise.all([
    getPaesseMitStatus(),
    getFeedStand(),
    getCurrentUser(),
  ]);

  const eintraege: PassEintrag[] = paesse.map(({ pass, status, strecke, gefahren }) => ({
    id: pass.id,
    name: pass.name,
    hoeheM: pass.hoeheM,
    kantone: pass.kantone,
    hochalpin: pass.hoeheM >= HOCHALPIN_AB_M,
    status: status
      ? {
          zustand: status.zustand,
          meldung: status.meldung,
          quelle: status.quelle,
          aktualisiertAm: status.aktualisiertAm,
        }
      : null,
    strecke,
    gefahren,
  }));

  const befahren = eintraege.filter((e) => e.gefahren).length;
  const hochalpin = eintraege.filter((e) => e.hochalpin);
  const hochalpinBefahren = hochalpin.filter((e) => e.gefahren).length;
  const ohneStrecke = eintraege.filter((e) => !e.strecke).length;

  return (
    <div className="flex min-h-dvh flex-col">
      <Header back="/" />
      <Seitenrahmen>
        <div>
          <h1 className="text-display font-semibold tracking-tight">Pässe der Schweiz</h1>
          <p className="mt-1 text-sm text-muted">
            {mitAnzahl(eintraege.length, "Passhöhe", "Passhöhen")}, ihr heutiger Zustand und die
            üblichen Wintersperren.
          </p>
        </div>

        {user ? (
          // Die Sammlung als Satz, nicht als Fortschrittsbalken: ein Balken
          // macht aus "ich war auf dem Susten" eine Quote, die man vollmachen
          // soll. Die Zahl genügt, und der Rest der Seite sagt, was fehlt.
          <p className="text-sm">
            <span className="font-mono font-semibold tabular-nums">
              {befahren} von {eintraege.length}
            </span>{" "}
            befahren
            {hochalpin.length > 0 && (
              <span className="text-muted">
                {" "}
                · hochalpin{" "}
                <span className="font-mono tabular-nums">
                  {hochalpinBefahren} von {hochalpin.length}
                </span>
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted">
            <Link href="/anmelden" className="underline underline-offset-2 hover:text-foreground">
              Melde dich an
            </Link>
            , dann siehst du hier, welche Pässe du schon gefahren bist.
          </p>
        )}

        <PaesseListe eintraege={eintraege} feedStand={feedStand} angemeldet={Boolean(user)} />

        {ohneStrecke > 0 && (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-4 py-4">
            <p className="text-sm">
              Für {mitAnzahl(ohneStrecke, "Pass", "Pässe")} gibt es noch keine Strecke auf Strado.
            </p>
            <Link href="/strecken/neu" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Strecke erstellen
            </Link>
          </div>
        )}

        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
          Status aus den Verkehrsmeldungen des ASTRA · Passhöhen nach swisstopo ·
          Wintersperren sind Erfahrungswerte
        </p>
      </Seitenrahmen>
    </div>
  );
}
