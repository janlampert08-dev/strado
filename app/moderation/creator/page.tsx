import { redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import CopyButton from "@/components/CopyButton";
import CreatorLinkForm from "@/components/CreatorLinkForm";
import CreatorLinkActions from "@/components/CreatorLinkActions";
import CreatorZuweisung from "@/components/CreatorZuweisung";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import SectionHeading from "@/components/ui/SectionHeading";
import { LinkIcon } from "@/components/NavIcons";
import { getCurrentUser } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";
import { alleCreatorLinks, einstiegsPfad, einstiegsUrl } from "@/lib/creatorLinks";
import { creatorKennzahlen } from "@/lib/creatorKennzahlen";
import { siteUrl } from "@/lib/siteUrl";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

export const metadata = { title: "Creator-Links – Strado" };

// Verwaltung der Einstiegscodes: anlegen, deaktivieren, löschen, Adresse
// kopieren.
//
// Derselbe Zugriffsschutz wie /moderation — und hier ist er keine
// Bequemlichkeit mehr, sondern die zweite Schranke vor den Schreibaktionen.
// Die erste ist die RLS-Policy aus 0084, die dritte die isModerator-Prüfung
// in jeder Server Action (lib/actions/creatorLinks.ts).
export default async function CreatorLinksPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");
  if (!(await isModerator(user.id))) redirect("/");

  // Über siteUrl() und nicht über den Host der Anfrage: sonst zeigte ein von
  // staging.strado.ch kopierter Link auf Staging, und dort kommt ausser
  // Moderatoren niemand hinein (proxy.ts).
  const basis = siteUrl();
  // Die Kennzahlen kommen aus creator_kennzahlen() (0091) und nicht aus
  // einer eigenen Abfrage: dieselbe Funktion, die ein Creator für seine
  // eigenen Codes aufruft — einem Moderator gibt sie jede Zeile zurück.
  // Eine Regel, eine Quelle.
  const [links, kennzahlen] = await Promise.all([alleCreatorLinks(), creatorKennzahlen()]);
  const aktive = links.filter((link) => link.aktiv).length;
  const zahlenVon = new Map(kennzahlen.map((k) => [k.code, k]));

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/moderation" />
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen>
          <div>
            <h1 className="text-display font-semibold">Creator-Links</h1>
            <p className="text-sm text-muted">
              {links.length} {links.length === 1 ? "Code" : "Codes"}
              {links.length > 0 && `, ${aktive} davon aktiv`}
            </p>
          </div>

          <Card className="flex flex-col gap-2 p-4 text-sm text-muted">
            <p>
              Jeder Link hängt beim Weiterleiten seine UTM-Parameter selbst an — in Vercel
              Web Analytics also nach{" "}
              <code className="font-mono text-foreground">utm_content</code> gruppierbar. Die
              Zahlen unten kommen dagegen aus der eigenen Datenbank und reichen weiter:
              Klicks, daraus entstandene Konten, daraus entstandene Abos.
            </p>
            <p>
              Ein Abo zählt auch dann noch, wenn es Monate nach der Registrierung
              dazukommt. Die{" "}
              <strong className="text-foreground">Klickzahl ist eine Anzeige, keine
              Messung</strong> — Codes stehen öffentlich, und ein Aufruf lässt sich
              wiederholen. Belastbar sind Konten und Abos.
            </p>
            <p>
              Wer unter <span className="font-mono text-foreground">Gehört zu</span> steht,
              sieht die Zahlen seines Codes selbst unter{" "}
              <span className="font-mono text-foreground">/creator</span> — den Namen des
              Codes, seine Klicks, Konten und Abos, aber nie, wer sich registriert hat.
            </p>
          </Card>

          <div className="flex flex-col gap-3">
            <SectionHeading>Neuen Link anlegen</SectionHeading>
            <CreatorLinkForm />
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeading>Vergeben</SectionHeading>
            {links.length === 0 ? (
              <EmptyState
                icon={LinkIcon}
                title="Noch kein Code vergeben. Leg oben den ersten an — danach steht hier die fertige Adresse zum Kopieren."
              />
            ) : (
              links.map((link) => {
                const adresse = einstiegsUrl(basis, link.code);
                const ziel = einstiegsPfad(link);
                const zahlen = zahlenVon.get(link.code);
                return (
                  <Card key={link.code} className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="font-medium">{link.name}</p>
                        <p className="text-sm text-muted">
                          {link.kanal}
                          {link.kampagne ? ` · ${link.kampagne}` : ""}
                        </p>
                      </div>
                      {!link.aktiv && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                          Deaktiviert
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* break-all, weil die Adresse auf einem Telefon sonst
                          seitlich aus der Karte läuft. */}
                      <code className="min-w-0 flex-1 font-mono text-sm break-all">
                        {adresse}
                      </code>
                      <CopyButton text={adresse} />
                    </div>

                    <p className="text-xs text-muted">
                      {link.aktiv ? (
                        <>
                          Leitet weiter auf <span className="font-mono break-all">{ziel}</span>
                        </>
                      ) : (
                        <>Leitet ohne Zuordnung auf die Startseite.</>
                      )}
                    </p>

                    <dl className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <dt className="text-muted">Klicks</dt>
                        <dd className="text-lg font-semibold tabular-nums">
                          {zahlen?.klicks ?? 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Konten</dt>
                        <dd className="text-lg font-semibold tabular-nums">
                          {zahlen?.registrierungen ?? 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Abos</dt>
                        <dd className="text-lg font-semibold tabular-nums">
                          {zahlen?.abos ?? 0}
                          {zahlen && zahlen.abosBeendet > 0 && (
                            <span className="ml-1.5 text-xs font-normal text-muted">
                              −{zahlen.abosBeendet} beendet
                            </span>
                          )}
                        </dd>
                      </div>
                    </dl>

                    <CreatorZuweisung
                      code={link.code}
                      kontoId={link.creator_user_id}
                      kontoName={link.kontoName}
                    />

                    <CreatorLinkActions
                      code={link.code}
                      aktiv={link.aktiv}
                      name={link.name}
                    />
                  </Card>
                );
              })
            )}
          </div>

          <p className="text-sm">
            <Link href="/moderation" className="text-accent hover:underline">
              Zurück zur Moderation
            </Link>
          </p>
        </Seitenrahmen>
      </div>
    </div>
  );
}
