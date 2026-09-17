"use client";

import { useState, useTransition } from "react";
import { passAlarmSetzen } from "@/lib/actions/passAlarm";
import Switch from "@/components/ui/Switch";

// "Alarm bei Öffnung" auf der Streckenseite eines Passes (0112, Premium).
//
// Ein Switch und kein Knopf: es ist ein Zustand, den man ein- und
// ausschaltet, kein Vorgang, den man auslöst — dasselbe Muster wie die
// Sichtbarkeitsschalter im Profil.
//
// Der Zustand wird beim Klick sofort umgestellt und nur bei einem Fehler
// zurückgenommen. Die Server Action ruft revalidatePath auf, die Seite
// bringt den echten Wert also ohnehin gleich nach; ein Schalter, der bis
// dahin in der alten Stellung steht, sieht nach einem verlorenen Klick aus.
//
// "ruht": der Alarm steht noch, das Abo nicht mehr. Ausschalten bleibt
// erlaubt (Delete-Policy ohne Premium-Bedingung, 0112), einschalten nicht —
// deshalb erscheint dieser Fall nur mit bereits gesetztem Alarm.
export default function PassAlarmSchalter({
  routeId,
  aktiv,
  ruht = false,
}: {
  routeId: string;
  aktiv: boolean;
  ruht?: boolean;
}) {
  const [an, setAn] = useState(aktiv);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col">
      <Switch
        label="Alarm bei Öffnung"
        description={
          ruht
            ? "Ohne Premium ruht der Alarm — entfernen kannst du ihn jederzeit."
            : "Sobald der Pass offen ist, steht es in deiner Aktivität."
        }
        checked={an}
        disabled={pending}
        onChange={(event) => {
          const ziel = event.target.checked;
          setAn(ziel);
          setFehler(null);
          startTransition(async () => {
            const { error } = await passAlarmSetzen(routeId, ziel);
            if (error) {
              setAn(!ziel);
              setFehler(error);
            }
          });
        }}
      />
      {fehler && (
        <p role="alert" className="pb-3 text-xs text-danger">
          {fehler}
        </p>
      )}
    </div>
  );
}
