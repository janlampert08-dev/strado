import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import AbschnittTabs from "@/components/ui/AbschnittTabs";
import Card from "@/components/ui/Card";
import Kennzahl, { Kennzahlen } from "@/components/ui/Kennzahl";
import SectionHeading from "@/components/ui/SectionHeading";
import MotorklasseBadge from "@/components/MotorklasseBadge";
import DeleteVehicleButton from "@/components/DeleteVehicleButton";
import PremiumHinweis from "@/components/PremiumHinweis";
import WartungsStatus from "@/components/WartungsStatus";
import Wartungsheft from "@/components/Wartungsheft";
import WartungserinnerungenForm from "@/components/WartungserinnerungenForm";
import {
  ChevronDown,
  AutoIcon,
  MotorradIcon,
  TerminIcon,
  WartungIcon,
} from "@/components/NavIcons";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getWartungsheft } from "@/lib/wartungsdaten";
import { istPremium } from "@/lib/premium";
import { motorklasseFor } from "@/lib/motorklassen";
import { isValidUuid } from "@/lib/validation";
import { todayInZurich } from "@/lib/format";
import { datumText, kmText } from "@/lib/wartung";
import type { Vehicle } from "@/types/database";

// Die Detailseite eines Fahrzeugs — der eine Ort des Wartungshefts
// (docs/premium-ausbau-plan.md §1: ein Feature, ein Ort, und der Ort ist
// die bestehende Fahrzeugkachel im Profil). Kein neuer Navigationspunkt.
//
// Ohne Abo zeigt die Seite alles ausser den Erinnerungen: Fahrzeugdaten,
// die aufgezeichneten Kilometer, vorhandene Einträge (lesen und löschen)
// und einen PremiumHinweis. Weggenommen wird nichts — bis 0111 gab es diese
// Seite gar nicht, und die bisherige Löschen-Aktion der Kachel ist hierher
// gezogen, nicht verschwunden.
//
// noindex ist nicht nötig: /profil/** liegt hinter der Anmeldung, und
// app/robots.ts hält Suchmaschinen ohnehin von den Profilpfaden fern.
export default async function FahrzeugPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");

  const supabase = await createClient();
  // Explizit auf die eigene user_id filtern, nicht bloss auf RLS vertrauen:
  // die Policy "Fahrzeuge sichtbar wenn freigegeben" (0015) gibt fremde
  // Fahrzeuge frei, deren Besitzer zeigt_fahrzeuge aktiviert hat. Ohne
  // dieses .eq() zeigte diese Seite mit der richtigen ID ein fremdes
  // Fahrzeug — samt Löschen-Knopf, der dann an der RLS scheitert.
  //
  // Abo-Status und Wartungsheft hängen nur an user.id und der ID aus der
  // Adresse, nicht am Fahrzeug — darum gemeinsam mit ihm geladen. Das
  // Wartungsheft filtert selbst auf user_id und liefert für eine fremde ID
  // nichts; notFound() folgt erst danach.
  const [{ data: fahrzeug }, premium, heft] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<Vehicle>(),
    istPremium(),
    getWartungsheft(user.id, id),
  ]);

  if (!fahrzeug) notFound();

  const Icon = fahrzeug.typ === "motorrad" ? MotorradIcon : AutoIcon;
  const heute = todayInZurich();

  return (
    // Dasselbe Gerüst wie jede andere Unterseite (app/fahrer/[id] etwa):
    // feste Kopfleiste, darunter der eigene Scrollbereich.
    <div className="flex h-dvh flex-col">
      <Header back="/profil" />
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen>
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
            <Icon className="h-6 w-6 text-muted" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-display font-semibold break-words">
              {fahrzeug.marke} {fahrzeug.modell}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span>
                {fahrzeug.getriebe === "automatik" ? "Automatik" : "Manuell"}
                {fahrzeug.baujahr && ` · ${fahrzeug.baujahr}`}
              </span>
              <MotorklasseBadge klasse={motorklasseFor(fahrzeug)} />
            </p>
          </div>
        </div>

        <Kennzahlen>
          <Kennzahl
            beschriftung="Auf Strado gefahren"
            wert={kmText(heft.aufgezeichnetKmTotal)}
            zusatz="nur aufgezeichnete Fahrten"
          />
          <Kennzahl
            beschriftung="Kilometerstand"
            wert={heft.schaetzung ? `≥ ${kmText(heft.schaetzung.mindestensKm)}` : "—"}
            zusatz={
              heft.schaetzung
                ? `${datumText(heft.schaetzung.ausgehendVonDatum)} + ${kmText(heft.schaetzung.aufgezeichnetKm)}`
                : "Trag einen Stand ein"
            }
          />
        </Kennzahlen>

        {/* Die Erklärung gehört zur Zahl, nicht auf die Seite: vorher stand
            sie als eigener Absatz zwischen Kacheln und Heft und riss den
            Flow auseinander. */}
        <details className="text-xs text-muted">
          <summary className="w-fit cursor-pointer list-none hover:text-foreground [&::-webkit-details-marker]:hidden">
            Warum „mindestens“?
          </summary>
          <p className="pt-1">
            Strado zählt nur, was aufgezeichnet wurde — der tatsächliche Stand liegt also
            höher. Deshalb meldet eine Fälligkeit nach Kilometern eher zu spät als zu früh.
          </p>
        </details>

        {premium ? (
          <AbschnittTabs
            tabs={[
              { titel: "Übersicht" },
              { titel: "Heft", anzahl: heft.eintraege.length },
              { titel: "Erinnerungen" },
            ]}
          >
            <section className="flex flex-col gap-3">
              <SectionHeading icon={TerminIcon}>Steht an</SectionHeading>
              <WartungsStatus mfk={heft.mfk} service={heft.service} />
            </section>

            <section className="flex flex-col gap-3">
              <SectionHeading icon={WartungIcon}>Wartungsheft</SectionHeading>
              <Wartungsheft
                fahrzeugId={fahrzeug.id}
                fahrzeugTyp={fahrzeug.typ}
                heute={heute}
                eintraege={heft.eintraege}
                darfSchreiben
              />
            </section>

            <div className="flex flex-col gap-3">
              <SectionHeading icon={TerminIcon}>Erinnerungen</SectionHeading>
              <Card className="p-4">
                <WartungserinnerungenForm
                  fahrzeugId={fahrzeug.id}
                  heute={heute}
                  erinnerungen={heft.erinnerungen}
                />
              </Card>
              <p className="text-xs text-muted">
                Strado erinnert dich hier in der App — es gibt keine E-Mail und keine
                Push-Benachrichtigung.
              </p>
            </div>
          </AbschnittTabs>
        ) : (
          <section className="flex flex-col gap-3">
            <SectionHeading icon={WartungIcon}>Wartungsheft</SectionHeading>
            <PremiumHinweis>
              Mit Premium führst du hier dein Wartungsheft und Strado erinnert dich an MFK und
              Service
            </PremiumHinweis>
            {/* Vorhandene Einträge bleiben nach einem Abo-Ende lesbar und
                löschbar — es sind die Daten der Person. Nur Neues und
                Ändern hängen am Abo. */}
            {heft.eintraege.length > 0 && (
              <>
                <Wartungsheft
                  fahrzeugId={fahrzeug.id}
                  fahrzeugTyp={fahrzeug.typ}
                  heute={heute}
                  eintraege={heft.eintraege}
                  darfSchreiben={false}
                />
                <p className="text-xs text-muted">
                  Deine bisherigen Einträge bleiben lesbar, und du kannst sie löschen. Neue
                  Einträge und Erinnerungen brauchen ein laufendes Abo.
                </p>
              </>
            )}
          </section>
        )}

        {/* Die Danger-Zone als Klappe statt Karte: Löschen ist der seltenste
            Weg auf dieser Seite und bekommt keine eigene Bühne. */}
        <details className="group rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-danger marker:content-none">
            Fahrzeug entfernen
            <ChevronDown
              className="h-4 w-4 text-muted transition-transform duration-fast group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="flex items-center justify-between gap-3 px-4 pb-4">
            <p className="text-sm text-muted">
              Entfernt das Fahrzeug samt Wartungsheft. Deine Fahrten bleiben, verlieren aber die
              Zuordnung zu diesem Fahrzeug.
            </p>
            <DeleteVehicleButton vehicleId={fahrzeug.id} nachLoeschenHref="/profil" />
          </div>
        </details>
        </Seitenrahmen>
      </div>
    </div>
  );
}
