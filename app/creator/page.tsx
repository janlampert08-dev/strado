import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import SectionHeading from "@/components/ui/SectionHeading";
import { LinkIcon } from "@/components/NavIcons";
import CopyButton from "@/components/CopyButton";
import KennzahlKachel from "@/components/KennzahlKachel";
import KlickVerlauf from "@/components/KlickVerlauf";
import { getCurrentUser } from "@/lib/supabase/server";
import { einstiegsUrl } from "@/lib/creatorLinks";
import {
  creatorKennzahlen,
  creatorVerlauf,
  eigeneCodes,
  summiere,
  verlaufNachCode,
} from "@/lib/creatorKennzahlen";
import { siteUrl } from "@/lib/siteUrl";
import { mitAnzahl, nomen } from "@/lib/format";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

export const metadata = { title: "Deine Zahlen – Strado" };

const VERLAUF_TAGE = 30;

// Das Dashboard für einen Creator: was sein Link gebracht hat.
//
// Zugriff hat, wem mindestens ein Code zugewiesen ist — es gibt keine
// Creator-Rolle als Spalte, die Zuweisung IST die Rolle (Migration 0091,
// dort ausführlich begründet). Vergeben wird sie unter /moderation/creator.
//
// Ein Moderator ohne eigenen Code landet hier bewusst NICHT: er sieht
// dieselben Zahlen für alle Codes in der Moderationsansicht.
//
// Und ein Moderator MIT eigenem Code sieht hier trotzdem nur seine eigenen:
// creator_kennzahlen() und creator_verlauf() geben ihm jede Zeile zurück
// (0091, für die Moderationsansicht so gewollt). Unter der Überschrift
// "Deine Zahlen" wäre das schlicht gelogen — die Summen oben addierten
// fremde Codes mit. Deshalb wird hier auf die eigenen Codes gefiltert,
// dieselbe Menge, die auch über den Zugang entscheidet.
export default async function CreatorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden?next=/creator");

  const meineCodes = new Set(await eigeneCodes(user.id));
  if (meineCodes.size === 0) redirect("/");

  const [alleKennzahlen, allerVerlauf] = await Promise.all([
    creatorKennzahlen(),
    creatorVerlauf(VERLAUF_TAGE),
  ]);
  const kennzahlen = alleKennzahlen.filter((k) => meineCodes.has(k.code));
  const verlauf = allerVerlauf.filter((t) => meineCodes.has(t.code));

  const summe = summiere(kennzahlen);
  const reihen = verlaufNachCode(verlauf);
  const reiheFuer = new Map(reihen.map((r) => [r.code, r]));
  const basis = siteUrl();

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen>
          <div>
            <h1 className="text-display font-semibold">Deine Zahlen</h1>
            <p className="text-sm text-muted">
              {mitAnzahl(kennzahlen.length, "Link", "Links")} · Verlauf der
              letzten {VERLAUF_TAGE} Tage
            </p>
          </div>

          {kennzahlen.length === 0 ? (
            <EmptyState
              icon={LinkIcon}
              title="Für dich ist noch kein Link hinterlegt. Sobald einer auf dich läuft, stehen die Zahlen hier."
            />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <KennzahlKachel
                  wert={summe.klicks}
                  beschriftung={nomen(summe.klicks, "Aufruf", "Aufrufe")}
                  hinweis="deiner Links"
                />
                <KennzahlKachel
                  wert={summe.registrierungen}
                  beschriftung={nomen(summe.registrierungen, "Konto", "Konten")}
                  hinweis="danach angemeldet"
                  anteilVon={summe.klicks}
                />
                <KennzahlKachel
                  wert={summe.abos}
                  beschriftung={nomen(summe.abos, "Abo", "Abos")}
                  hinweis="Premium abgeschlossen"
                  anteilVon={summe.registrierungen}
                />
              </div>

              <Card className="flex flex-col gap-2 p-4 text-sm text-muted">
                <p>
                  Ein Konto zählt, wenn es über deinen Link entstanden ist. Ein
                  Abo zählt auch dann noch, wenn es{" "}
                  <strong className="text-foreground">Monate später</strong>{" "}
                  dazukommt — die Zuordnung bleibt am Konto hängen.
                </p>
                <p>
                  Die Aufrufzahl ist eine Anzeige, keine Messung: Codes stehen
                  öffentlich, und ein Aufruf lässt sich wiederholen. Belastbar
                  sind die Abos — sie entstehen über den Zahlungsanbieter. Auch
                  die Konten sind nur so belastbar wie eine Anmeldung: wer einen
                  Code kennt, kann sich darüber anmelden, ohne je auf den Link
                  geklickt zu haben.
                </p>
              </Card>

              <div className="flex flex-col gap-3">
                <SectionHeading>Je Link</SectionHeading>
                {kennzahlen.map((k) => {
                  const reihe = reiheFuer.get(k.code);
                  return (
                    <Card key={k.code} className="flex flex-col gap-4 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono font-medium">/c/{k.code}</p>
                          <p className="text-sm text-muted">
                            {k.kanal}
                            {k.kampagne ? ` · ${k.kampagne}` : ""}
                          </p>
                        </div>
                        {!k.aktiv && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                            Deaktiviert
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* break-all, weil die Adresse auf einem Telefon sonst
                            seitlich aus der Karte läuft. */}
                        <code className="min-w-0 flex-1 font-mono text-sm break-all">
                          {einstiegsUrl(basis, k.code)}
                        </code>
                        <CopyButton text={einstiegsUrl(basis, k.code)} />
                      </div>

                      <dl className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <dt className="text-muted">Aufrufe</dt>
                          <dd className="text-lg font-semibold tabular-nums">
                            {k.klicks.toLocaleString("de-CH")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Konten</dt>
                          <dd className="text-lg font-semibold tabular-nums">
                            {k.registrierungen.toLocaleString("de-CH")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Abos</dt>
                          <dd className="text-lg font-semibold tabular-nums">
                            {k.abos.toLocaleString("de-CH")}
                          </dd>
                        </div>
                      </dl>

                      {reihe && <KlickVerlauf reihe={reihe} />}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </Seitenrahmen>
      </div>
    </div>
  );
}
