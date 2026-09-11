import { redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import CopyButton from "@/components/CopyButton";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { LinkIcon } from "@/components/NavIcons";
import { getCurrentUser } from "@/lib/supabase/server";
import { isModerator } from "@/lib/moderation";
import { CREATOR_LINKS, einstiegsPfad, einstiegsUrl } from "@/lib/creatorLinks";
import { siteUrl } from "@/lib/siteUrl";

export const metadata = { title: "Creator-Links – Strado" };

// Übersicht der vergebenen Einstiegslinks: die fertige Adresse zum Kopieren
// und das Ziel, auf das sie auflöst. Reine Anzeige — vergeben werden die
// Codes in lib/creatorLinks.ts, und das ist in Phase 1 Absicht (siehe die
// Begründung dort).
//
// Derselbe Zugriffsschutz wie /moderation: Anmeldung plus Moderator-Status.
// Er ist hier eine Bequemlichkeit und keine Geheimhaltung — die Links sind
// dafür gedacht, öffentlich verteilt zu werden. Er hält die Seite aus dem
// Weg von allen, die sie nichts angeht.
export default async function CreatorLinksPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");
  if (!(await isModerator(user.id))) redirect("/");

  // Über siteUrl() und nicht über den Host der Anfrage: sonst zeigte ein von
  // staging.strado.ch kopierter Link auf Staging, und dort kommt ausser
  // Moderatoren niemand hinein (proxy.ts).
  const basis = siteUrl();

  return (
    <div className="flex h-dvh flex-col">
      <Header back="/moderation" />
      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
          <div>
            <h1 className="text-display font-semibold">Creator-Links</h1>
            <p className="text-sm text-muted">
              {CREATOR_LINKS.length} {CREATOR_LINKS.length === 1 ? "Link" : "Links"} vergeben
            </p>
          </div>

          <Card className="flex flex-col gap-2 p-4 text-sm text-muted">
            <p>
              Jeder Link hängt beim Weiterleiten seine UTM-Parameter selbst an. Die Zahlen
              stehen in Vercel Web Analytics — dort nach{" "}
              <code className="font-mono text-foreground">utm_content</code> gruppieren.
            </p>
            <p>
              Gezählt werden <strong className="text-foreground">Aufrufe, keine Registrierungen</strong>.
              Wie der Schritt dorthin aussähe, steht in{" "}
              <code className="font-mono text-foreground">docs/creator-links-plan.md</code>.
            </p>
          </Card>

          {CREATOR_LINKS.length === 0 ? (
            <EmptyState
              icon={LinkIcon}
              title="Noch kein Code vergeben. Neue Codes kommen in lib/creatorLinks.ts dazu — ein Eintrag pro Creator."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {CREATOR_LINKS.map((link) => {
                const adresse = einstiegsUrl(basis, link.code);
                const ziel = einstiegsPfad(link);
                return (
                  <Card key={link.code} className="flex flex-col gap-3 p-4">
                    <div>
                      <p className="font-medium">{link.name}</p>
                      <p className="text-sm text-muted">
                        {link.kanal}
                        {link.kampagne ? ` · ${link.kampagne}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* break-all, weil die Adresse auf einem Telefon sonst
                          seitlich aus der Karte läuft. */}
                      <code className="min-w-0 flex-1 font-mono text-sm break-all">{adresse}</code>
                      <CopyButton text={adresse} />
                    </div>

                    <p className="text-xs text-muted">
                      Leitet weiter auf <span className="font-mono break-all">{ziel}</span>
                    </p>
                  </Card>
                );
              })}
            </div>
          )}

          <p className="text-sm">
            <Link href="/moderation" className="text-accent hover:underline">
              Zurück zur Moderation
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
