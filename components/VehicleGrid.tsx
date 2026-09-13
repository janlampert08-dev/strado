import { Bike, Car } from "lucide-react";
import type { Vehicle } from "@/types/database";
import DeleteVehicleButton from "@/components/DeleteVehicleButton";
import MotorklasseBadge from "@/components/MotorklasseBadge";
import { motorklasseFor } from "@/lib/motorklassen";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";

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
export default function VehicleGrid({
  vehicles,
  editable = true,
}: {
  vehicles: Vehicle[];
  editable?: boolean;
}) {
  if (vehicles.length === 0) {
    return <EmptyState icon={Car} title="Noch keine Fahrzeuge hinterlegt." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {vehicles.map((vehicle) => {
        const Icon = TYP_ICON[vehicle.typ];
        // Aus den gespeicherten Werten abgeleitet statt mitgeführt: die
        // Klasse eines Fahrzeugs ist kein eigener Zustand, sondern eine
        // Funktion von typ/hubraum/leistung (lib/motorklassen.ts).
        const klasse = motorklasseFor(vehicle);
        return (
          <Card
            key={vehicle.id}
            surface
            className="flex items-start gap-3 p-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              <Icon className="h-5 w-5 text-muted" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate font-medium">
                {vehicle.marke} {vehicle.modell}
              </p>
              <p className="text-sm text-muted">
                {GETRIEBE_LABEL[vehicle.getriebe]}
                {vehicle.baujahr && ` · ${vehicle.baujahr}`}
              </p>
              {/* Unter der Zeile statt rechts daneben: bei 375 px bliebe
                  neben Marke/Modell und dem Löschen-Knopf kein Platz. */}
              <MotorklasseBadge klasse={klasse} className="mt-1" />
            </div>
            {editable && <DeleteVehicleButton vehicleId={vehicle.id} />}
          </Card>
        );
      })}
    </div>
  );
}
