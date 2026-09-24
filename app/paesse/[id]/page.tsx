import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import Kennzahl, { Kennzahlen } from "@/components/ui/Kennzahl";
import { buttonVariants } from "@/components/ui/Button";
import { Compass, FeedbackIcon, Gauge, KalenderIcon, StreckeIcon } from "@/components/NavIcons";
import PassStatusZeile, { PassStatusMarke } from "@/components/PassStatusZeile";
import PassFolgenButton from "@/components/PassFolgenButton";
import PassKalenderAbschnitt from "@/components/PassKalenderAbschnitt";
import { getPassSeite } from "@/lib/paesse";
import { anzeigeFuerStatus } from "@/lib/passStatus";
import { offenSeitText } from "@/lib/passKalender";
import { kantoneText, passBeschreibung, passFragen, ueberPass } from "@/lib/passSeite";
import { formatKm, formatMeter } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/siteUrl";
import { ogMitBild } from "@/lib/openGraph";

// Die Seite eines einzelnen Passes: heutiger Zustand, übliche Wintersperre,
// die Strecke darüber, die Nachbarn.
//
// Bis hierhin war ein Pass nur eine Zeile auf /paesse (Anker #id). Wer nach
// "Sustenpass offen" sucht, will aber eine Seite über den Susten, nicht eine
// Liste mit 34 Pässen, in der er den seinen suchen muss — und eine Liste
// rankt für keinen einzelnen Namen. Der Anker bleibt auf /paesse bestehen,
// damit alte Links weiter an die richtige Zeile springen.
//
// Dynamisch gerendert (Cookies: Folgen, Stempel), wie /paesse. Der Status
// steht deshalb im HTML so frisch wie der Feed — aber bewusst NICHT in den
// strukturierten Daten, im Titel oder im Vorschaubild: dort würde ein
// gecachter Stand als Tatsachenbehauptung weitergereicht (siehe
// app/paesse/page.tsx).

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const seite = await getPassSeite(id);
  // Wie auf der Streckenseite: der Tab sagt dasselbe wie der Inhalt, den
  // notFound() unten zeigt.
  if (!seite) return { title: "Seite nicht gefunden – Strado" };

  const { pass } = seite;
  const beschreibung = passBeschreibung(pass);

  return {
    alternates: { canonical: `/paesse/${pass.id}` },
    // Die Frage, die gestellt wird ("Sustenpass offen?"), steht im Titel —
    // die Antwort steht auf der Seite, nicht hier, weil ein Suchergebnis
    // Tage alt sein kann.
    title: `${pass.name} – offen oder gesperrt? Passstatus heute | Strado`,
    description: beschreibung,
    openGraph: {
      ...ogMitBild(
        `/paesse/${pass.id}/opengraph-image`,
        `${pass.name}, ${pass.hoeheM.toLocaleString("de-CH")} m`,
      ),
      type: "website",
      title: `${pass.name} (${pass.hoeheM.toLocaleString("de-CH")} m) – Passstatus`,
      description: beschreibung,
    },
  };
}

export default async function PassSeite({ params }: Props) {
  const { id } = await params;
  const [seite, user] = await Promise.all([getPassSeite(id), getCurrentUser()]);
  if (!seite) notFound();

  const { pass, status, ereignisse, sperrtage, folgtMan, strecken, nachbarn, feedStand } = seite;
  const anzeige = anzeigeFuerStatus(
    status
      ? {
          zustand: status.zustand,
          meldung: status.meldung,
          quelle: status.quelle,
          aktualisiertAm: status.aktualisiertAm,
          manuellBis: status.manuellBis,
        }
      : null,
    feedStand,
  );
  const offenSeit = offenSeitText(anzeige.zustand, status?.seit ?? null, ereignisse);
  const hoehe = pass.hoeheM.toLocaleString("de-CH");
  const ersteStrecke = strecken[0] ?? null;
  const fragen = passFragen({
    pass,
    anzeige,
    strecke: ersteStrecke ? { name: ersteStrecke.name, laengeKm: ersteStrecke.laengeKm } : null,
  });

  // Strukturierte Daten: der Pass als Ort mit Koordinaten und Höhe, dazu der
  // Brotkrumenpfad. Nur Katalogwerte — der Status bleibt draussen, aus dem
  // Grund, den app/paesse/page.tsx festhält.
  const origin = siteUrl();
  const { scheitel } = seite;
  const strukturierteDaten = [
    {
      "@context": "https://schema.org",
      "@type": ["TouristAttraction", "Place"],
      "@id": `${origin}/paesse/${pass.id}`,
      inLanguage: "de-CH",
      name: pass.name,
      description: passBeschreibung(pass),
      url: `${origin}/paesse/${pass.id}`,
      image: `${origin}/paesse/${pass.id}/opengraph-image`,
      ...(scheitel
        ? {
            geo: {
              "@type": "GeoCoordinates",
              // GeoJSON zählt [lng, lat] — GeoCoordinates will es umgekehrt.
              latitude: scheitel[1],
              longitude: scheitel[0],
              elevation: pass.hoeheM,
            },
          }
        : {}),
      containedInPlace: pass.kantone.map((k) => ({
        "@type": "AdministrativeArea",
        name: kantoneText([k]),
      })),
      ...(ersteStrecke
        ? {
            subjectOf: strecken.map((s) => ({
              "@type": "TouristTrip",
              name: s.name,
              url: `${origin}/strecken/${s.id}`,
            })),
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Strado", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Pässe", item: `${origin}/paesse` },
        { "@type": "ListItem", position: 3, name: pass.name, item: `${origin}/paesse/${pass.id}` },
      ],
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Namen stammen aus dem Passkatalog, Streckennamen aus Vorschlägen —
          escaped wie auf der Streckenseite, sonst beendete ein "</script>"
          im Text den Block. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(strukturierteDaten)
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/&/g, "\\u0026"),
        }}
      />
      <Header back="/paesse" />
      <Seitenrahmen>
        <div>
          {/* Der sichtbare Brotkrumenpfad zum JSON-LD oben: eine Zeile, in
              der Art der Regionszeile über dem Streckentitel. */}
          <nav aria-label="Brotkrumen" className="text-sm text-muted">
            <Link href="/paesse" className="underline-offset-2 hover:text-foreground hover:underline">
              Pässe
            </Link>
            <span aria-hidden="true"> · </span>
            {kantoneText(pass.kantone)}
          </nav>
          <h1 className="text-display font-semibold tracking-tight">
            {pass.name} <span className="text-muted">({hoehe} m)</span>
          </h1>
        </div>

        {/* Der Status zuerst: er ist die Frage, mit der man hier landet. Die
            Zeile ist dieselbe wie überall (PassStatusZeile), samt Quelle und
            Alter — ein Status ohne Herkunft wird geglaubt oder verworfen,
            beides ohne Grundlage. */}
        <section aria-labelledby="status" className="flex flex-col gap-2">
          <SectionHeading id="status" icon={Gauge}>
            Status heute
          </SectionHeading>
          <Card className="flex flex-col gap-3 px-4 py-3">
            <PassStatusZeile anzeige={anzeige} />
            {offenSeit && <p className="text-xs text-muted">{offenSeit}</p>}
            <div className="border-t border-border pt-3">
              <PassFolgenButton
                passId={pass.id}
                passName={pass.name}
                folgtMan={folgtMan}
                angemeldet={Boolean(user)}
              />
            </div>
          </Card>
        </section>

        <section aria-labelledby="saison" className="flex flex-col gap-2">
          <SectionHeading id="saison" icon={KalenderIcon}>
            Wintersperre & Sperrungen
          </SectionHeading>
          <PassKalenderAbschnitt
            wintersperreAbMonat={pass.wintersperreAbMonat}
            wintersperreBisMonat={pass.wintersperreBisMonat}
            sperrtage={sperrtage}
            ereignisse={ereignisse}
          />
          {pass.wintersperreAbMonat === null && (
            <p className="text-sm text-muted">Keine übliche Wintersperre — ganzjährig befahrbar.</p>
          )}
        </section>

        <section aria-labelledby="strecke" className="flex flex-col gap-2">
          <SectionHeading id="strecke" icon={StreckeIcon}>
            {strecken.length > 1 ? "Strecken" : "Strecke"} {ueberPass(pass.id, pass.name)}
          </SectionHeading>
          {strecken.length > 0 ? (
            strecken.map((strecke) => (
              <Card key={strecke.id} className="druckbar relative flex flex-col gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {/* after:inset-0: die ganze Karte ist die Tippfläche. */}
                    <Link
                      href={`/strecken/${strecke.id}`}
                      className="hover:text-accent-ink after:absolute after:inset-0 after:content-['']"
                    >
                      {strecke.name}
                    </Link>
                  </p>
                  <p className="text-sm text-muted">
                    {strecke.region} ·{" "}
                    {strecke.istRundfahrt
                      ? `Start/Ziel: ${strecke.startOrt}`
                      : `${strecke.startOrt} → ${strecke.zielOrt}`}
                  </p>
                </div>
                <Kennzahlen>
                  <Kennzahl beschriftung="Länge" wert={`${formatKm(strecke.laengeKm)} km`} />
                  <Kennzahl beschriftung="Kehren" wert={strecke.kehren ?? "—"} />
                  <Kennzahl
                    beschriftung="Höchster Punkt"
                    wert={strecke.hoeheM !== null ? formatMeter(strecke.hoeheM) : "—"}
                  />
                  <Kennzahl
                    beschriftung="Max. Steigung"
                    wert={strecke.maxSteigungProzent !== null ? `${strecke.maxSteigungProzent} %` : "—"}
                  />
                </Kennzahlen>
              </Card>
            ))
          ) : (
            // Dieselbe Form wie der Aufruf am Ende von /paesse: die Lücke ist
            // die Einladung, nicht ein Fehler.
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3">
              <p className="text-sm text-muted">Noch keine Strecke {ueberPass(pass.id, pass.name)}.</p>
              <Link href="/strecken/neu" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Vorschlagen
              </Link>
            </div>
          )}
        </section>

        {/* Die Fragen, mit denen man hier sucht — mit Antworten nur aus den
            Daten, die die Seite oben ohnehin zeigt (lib/passSeite.ts). Kein
            FAQPage-Markup: Google zeigt es seit 2023 nur noch für Behörden-
            und Gesundheitsseiten, und der Status gehörte ohnehin nicht
            hinein. */}
        <section aria-labelledby="fragen" className="flex flex-col gap-2">
          <SectionHeading id="fragen" icon={FeedbackIcon}>
            Häufige Fragen
          </SectionHeading>
          <div className="flex flex-col gap-4">
            {fragen.map((f) => (
              <div key={f.frage} className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">{f.frage}</h3>
                <p className="text-sm leading-relaxed text-muted">{f.antwort}</p>
              </div>
            ))}
          </div>
        </section>

        {nachbarn.length > 0 && (
          <section aria-labelledby="naehe" className="flex flex-col gap-2">
            <SectionHeading id="naehe" icon={Compass}>
              Pässe in der Nähe
            </SectionHeading>
            <Card as="ul" className="divide-y divide-border">
              {nachbarn.map((nachbar) => (
                <li key={nachbar.pass.id} className="druckbar relative flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      <Link
                        href={`/paesse/${nachbar.pass.id}`}
                        className="hover:text-accent-ink after:absolute after:inset-0 after:content-['']"
                      >
                        {nachbar.pass.name}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {nachbar.pass.hoeheM.toLocaleString("de-CH")} m · {nachbar.pass.kantone.join(" / ")}
                      {nachbar.distanzKm !== null && ` · ${Math.round(nachbar.distanzKm)} km Luftlinie`}
                    </p>
                  </div>
                  <PassStatusMarke anzeige={anzeigeFuerStatus(nachbar.status, feedStand)} className="shrink-0" />
                </li>
              ))}
            </Card>
          </section>
        )}

        <details className="text-xs text-muted">
          <summary className="cursor-pointer list-none hover:text-foreground [&::-webkit-details-marker]:hidden">
            Quellen & Stand
          </summary>
          <p className="pt-1">
            Status aus den Verkehrsmeldungen des ASTRA · Passhöhe nach swisstopo ·
            Wintersperren sind Erfahrungswerte
          </p>
        </details>
      </Seitenrahmen>
    </div>
  );
}
