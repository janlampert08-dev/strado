import type { Motorklasse } from "@/types/database";
import { motorklassendefinition } from "@/lib/motorklassen";
import { cn } from "@/lib/utils/cn";

// Die Motorklasse als Pille — überall gleich: in der Garage, neben der
// Fahrzeugwahl im Fahrt-Fazit und (später) an der gewerteten Fahrt.
//
// Die Regel ("bis 125 cm³ · bis 11 kW") steht bewusst als title-Attribut
// daneben statt im sichtbaren Text: in einer Kachelliste wäre sie Lärm, beim
// Nachschlagen aber genau das, was fehlt. Wo Platz ist, zeigt der Aufrufer
// sie über `regelAnzeigen` mit an.
//
// "unbestimmt" ist der Zustand ohne Leistungsangabe. Er ist kein Fehler —
// die Angabe ist freiwillig —, deshalb gedeckt statt warnend eingefärbt.
export default function MotorklasseBadge({
  klasse,
  regelAnzeigen = false,
  className,
}: {
  klasse: Motorklasse | null;
  regelAnzeigen?: boolean;
  className?: string;
}) {
  if (klasse === null) {
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-xs text-muted",
          className,
        )}
      >
        Ohne Klasse
      </span>
    );
  }

  const definition = motorklassendefinition(klasse);

  return (
    <span
      title={definition.regel}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md border border-accent/30 bg-accent-subtle px-2 py-0.5 font-mono text-xs font-medium text-accent",
        className,
      )}
    >
      {definition.label}
      {regelAnzeigen && <span className="text-muted">{definition.regel}</span>}
    </span>
  );
}
