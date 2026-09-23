import Link from "next/link";
import { Bike, Car, ChevronRight } from "@/components/NavIcons";
import type { Vehicle } from "@/types/database";
import MotorklasseBadge from "@/components/MotorklasseBadge";
import { motorklasseFor } from "@/lib/motorklassen";
import type { WartungsStatus } from "@/lib/wartung";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";

const TYP_ICON: Record<Vehicle["typ"], typeof Car> = {
  auto: Car,
  motorrad: Bike,
};

const GETRIEBE_LABEL: Record<Vehicle["getriebe"], string> = {
  manuell: "Manuell",
  automatik: "Automatik",
};

// Ersetzt die vorherige <table>-Darstellung (VehicleList.tsx) durch ein
// Kachel-Raster, konsistent mit den Stat-Kacheln auf derselben Seite
// (Card surface) statt einer eigenständigen Tabellen-Optik. Gemeinsam von
// der eigenen Profilseite (editable) und der öffentlichen Fahrer-Seite
// (nur lesend) genutzt, damit die Garage an beiden Stellen gleich aussieht
// statt wie zuvor auf /fahrer/[id] als schlichte Textliste zu erscheinen.
// Ab lg (Desktop) drei statt zwei Spalten, da Fahrzeug-Karten dort sonst
// unnötig viel Leerraum neben dem Text hätten.
//
// Seit dem Wartungsheft (0111) ist die eigene Kachel ein Verweis auf
// app/profil/fahrzeuge/[id] und trägt dort statt des Löschen-Knopfs den
// Chevron — dazu höchstens eine Zeile, wenn eine Wartung ansteht.

// Farbe nur, wo sie etwas sagt (dieselbe Regel wie in
// components/WartungsStatus.tsx): "bald" bleibt in der gedämpften Schrift,
// erst fällig und überfällig färben.
const HINWEIS_FARBE: Record<WartungsStatus, string> = {
  ok: "text-muted",
  bald: "text-muted",
  faellig: "text-warning",
  ueberfaellig: "text-danger",
};

export default function VehicleGrid({
  vehicles,
  editable = true,
  hinweise,
}: {
  vehicles: Vehicle[];
  /** true (Vorgabe): die eigene Garage — jede Kachel führt auf die
   *  Fahrzeugseite. false: das öffentliche Profil eines anderen, nur
   *  lesend und ohne Verweis. */
  editable?: boolean;
  /**
   * Je Fahrzeug-ID höchstens eine kurze Wartungszeile ("MFK in 3 Wochen"),
   * und nur, wenn etwas ansteht (lib/wartungsdaten.ts →
   * getWartungsHinweise). Ohne Abo und ohne gesetzte Erinnerung ist die
   * Map leer und die Kachel sieht aus wie bisher.
   */
  hinweise?: Record<string, { text: string; status: WartungsStatus }>;
}) {
  if (vehicles.length === 0) {
    // Auf der eigenen Profilseite führt der Leerzustand direkt zum Anlegen;
    // die "+ Hinzufügen"-Aktion in der Abschnittszeile ist klein und steht
    // rechts oben, weit weg von der Stelle, auf die der Blick hier fällt.
    // Auf fremden Profilen bleibt es bei der Feststellung.
    return (
      <EmptyState
        icon={Car}
        title="Noch keine Fahrzeuge hinterlegt."
        action={
          editable ? (
            <Link
              href="/profil/fahrzeuge/neu"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              Fahrzeug hinzufügen
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {vehicles.map((vehicle) => {
        const Icon = TYP_ICON[vehicle.typ];
        // Aus den gespeicherten Werten abgeleitet statt mitgeführt: die
        // Klasse eines Fahrzeugs ist kein eigener Zustand, sondern eine
        // Funktion von typ/hubraum/leistung (lib/motorklassen.ts).
        const klasse = motorklasseFor(vehicle);
        const hinweis = hinweise?.[vehicle.id];

        const inhalt = (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              <Icon className="h-5 w-5 text-muted" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">
                {vehicle.marke} {vehicle.modell}
              </span>
              <span className="text-sm text-muted">
                {GETRIEBE_LABEL[vehicle.getriebe]}
                {vehicle.baujahr && ` · ${vehicle.baujahr}`}
              </span>
              {/* Unter der Zeile statt rechts daneben: bei 375 px bliebe
                  neben Marke/Modell und dem Chevron kein Platz. */}
              <MotorklasseBadge klasse={klasse} className="mt-1" />
              {hinweis && (
                <span className={`mt-1 text-xs ${HINWEIS_FARBE[hinweis.status]}`}>{hinweis.text}</span>
              )}
            </span>
            {editable && (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            )}
          </>
        );

        // Die ganze Kachel ist der Verweis, kein zusätzlicher "Öffnen"-Knopf:
        // auf dem Telefon ist die Fläche das Bedienelement. Das Löschen ist
        // deshalb von der Kachel auf die Fahrzeugseite gezogen — ein
        // Knopf INNERHALB eines Links ist ungültiges HTML, und ein
        // zerstörender Knopf im Raster war ohnehin einen Fehlgriff vom
        // Verlust entfernt.
        return editable ? (
          <Card key={vehicle.id} surface className="transition-colors duration-fast hover:border-muted">
            <Link
              href={`/profil/fahrzeuge/${vehicle.id}`}
              className="flex items-start gap-3 rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {inhalt}
            </Link>
          </Card>
        ) : (
          <Card key={vehicle.id} surface className="flex items-start gap-3 p-4">
            {inhalt}
          </Card>
        );
      })}
    </div>
  );
}
