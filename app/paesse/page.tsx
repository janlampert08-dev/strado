import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import { BergIcon } from "@/components/NavIcons";
import { PassStatusMarke } from "@/components/PassStatusZeile";
import PaesseListe, { type PassEintrag } from "@/components/PaesseListe";
import { buttonVariants } from "@/components/ui/Button";
import { getFeedStand, getPaesseMitStatus, HOCHALPIN_AB_M } from "@/lib/paesse";
import { anzeigeFuerStatus } from "@/lib/passStatus";
import { getCurrentUser } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
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
  const [paesse, feedStand, user, origin] = await Promise.all([
    getPaesseMitStatus(),
    getFeedStand(),
    getCurrentUser(),
    getOrigin(),
  ]);

  const eintraege: PassEintrag[] = paesse.map(({ pass, status, strecke, gefahren, folgtMan }) => ({
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
          manuellBis: status.manuellBis,
        }
      : null,
    strecke,
    gefahren,
    folgtMan,
  }));

  const befahren = eintraege.filter((e) => e.gefahren).length;
  const hochalpin = eintraege.filter((e) => e.hochalpin);
  const hochalpinBefahren = hochalpin.filter((e) => e.gefahren).length;
  const ohneStrecke = eintraege.filter((e) => !e.strecke).length;
  const gefolgt = eintraege.filter((e) => e.folgtMan);

  // Strukturierte Daten für den Passkatalog — der zweite Evergreen-Inhalt
  // neben den Streckenseiten (app/sitemap.ts). Nur der öffentliche Katalog:
  // Name, Höhe und Kantone stehen so auch sichtbar in jeder Zeile
  // (components/PaesseListe.tsx), die Sammlung ("gefahren", "folgtMan")
  // gehört einem einzelnen Konto und hat hier nichts zu suchen. Der Status
  // bleibt draussen, weil er sich alle fünf Minuten ändern kann und ein
  // gecachter Stand als Tatsachenbehauptung im Index landete.
  const strukturierteDaten = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    inLanguage: "de-CH",
    name: "Pässe der Schweiz",
    numberOfItems: eintraege.length,
    itemListElement: eintraege.map((eintrag, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "TouristAttraction",
        name: eintrag.name,
        description: `${eintrag.hoeheM.toLocaleString("de-CH")} m · ${eintrag.kantone.join(" / ")}${eintrag.strecke ? "" : " · noch keine Strecke"}`,
        url: eintrag.strecke
          ? `${origin}/strecken/${eintrag.strecke.id}`
          : `${origin}/paesse#${eintrag.id}`,
      },
    })),
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Namen stammen aus dem Passkatalog (Moderationsinput). Wie auf der
          Streckenseite escaped — ein "</script>" im Text beendete sonst den
          Block (siehe app/strecken/[id]/page.tsx). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(strukturierteDaten)
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/&/g, "\\u0026"),
        }}
      />
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
            <span className="font-semibold tabular-nums">
              {befahren} von {eintraege.length}
            </span>{" "}
            befahren
            {hochalpin.length > 0 && (
              <span className="text-muted">
                {" "}
                · hochalpin{" "}
                <span className="tabular-nums">
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

        {user && gefolgt.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHeading icon={BergIcon}>Meine Pässe</SectionHeading>
            <p className="text-sm text-muted">
              Du folgst {gefolgt.length} von {eintraege.length} Pässen.
            </p>
            <Card as="ul" className="divide-y divide-border">
              {gefolgt.map((eintrag) => {
                const anzeige = anzeigeFuerStatus(eintrag.status, feedStand);
                const ziel = eintrag.strecke
                  ? `/strecken/${eintrag.strecke.id}`
                  : `/paesse#${eintrag.id}`;
                return (
                  <li key={eintrag.id} className="druckbar relative flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        <Link href={ziel} className="hover:text-accent-ink after:absolute after:inset-0 after:content-['']">
                          {eintrag.name}
                        </Link>
                      </p>
                      <p className="truncate text-xs text-muted">
                        {eintrag.hoeheM.toLocaleString("de-CH")} m · {eintrag.kantone.join(" / ")}
                      </p>
                    </div>
                    <PassStatusMarke anzeige={anzeige} className="shrink-0" />
                  </li>
                );
              })}
            </Card>
          </section>
        )}

        <PaesseListe eintraege={eintraege} feedStand={feedStand} angemeldet={Boolean(user)} />

        {ohneStrecke > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3">
            <p className="text-sm text-muted">
              Für {mitAnzahl(ohneStrecke, "Pass", "Pässe")} gibt es noch keine Strecke.
            </p>
            <Link href="/strecken/neu" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Erstellen
            </Link>
          </div>
        )}

        <details className="text-xs text-muted">
          <summary className="cursor-pointer list-none hover:text-foreground [&::-webkit-details-marker]:hidden">
            Quellen & Stand
          </summary>
          <p className="pt-1">
            Status aus den Verkehrsmeldungen des ASTRA · Passhöhen nach swisstopo ·
            Wintersperren sind Erfahrungswerte
          </p>
        </details>
      </Seitenrahmen>
    </div>
  );
}
