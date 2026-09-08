"use client";

import { useEffect, useState } from "react";
import LiveTrackingForm from "@/components/LiveTrackingForm";
import type { KartenStrecke, RouteGeoJSON, Vehicle } from "@/types/database";
import { buttonVariants } from "@/components/ui/Button";

export default function GefahrenSection({
  route,
  kontextStrecken,
  userId,
  vehicles,
  personalBestSeconds,
  guestContinuationToken = null,
  maxPhotos,
}: {
  route: RouteGeoJSON;
  // Umliegende freigegebene Strecken, die auf der Aufzeichnungskarte zur
  // Orientierung mitgezeichnet werden (serverseitig ausgewählt, siehe
  // getKontextStrecken in lib/routes.ts). Rein darstellend: sie sind dort
  // weder anklickbar noch für Start-/Zielgate oder Deckungsgrad relevant.
  kontextStrecken: KartenStrecke[];
  // null heisst abgemeldeter Besucher — aufzeichnen darf er, das Konto
  // verlangt erst das Speichern (siehe LiveTrackingForm.tsx).
  userId: string | null;
  vehicles: Vehicle[];
  personalBestSeconds: number | null;
  /** Fotos pro Fahrt, aus dem Abo-Zustand (lib/premium.ts). */
  maxPhotos: number;
  // Aus ?fortsetzen=<token>: der Besucher kommt gerade aus dem Anmelde-Gate
  // einer als Gast aufgezeichneten Fahrt zurück.
  guestContinuationToken?: string | null;
}) {
  // Standardmässig eingeklappt, damit die Seite beim blossen Ansehen einer
  // Strecke nicht durch ein immer offenes Formular überladen wirkt. Bleibt
  // nach dem Öffnen bewusst offen (kein Wieder-Einklappen), damit eine
  // laufende GPS-Aufzeichnung nie durch Unmounten unterbrochen werden kann —
  // "Zurück"/"Verwerfen" in LiveTrackingForm klappt über onExit wieder ein.
  //
  // Ausnahme: mit einem Fortsetzungs-Marker klappt der Abschnitt sofort auf.
  // Sonst käme der Besucher nach der Anmeldung auf einer Seite an, die von
  // seiner eben gefahrenen Strecke nichts zeigt — LiveTrackingForm muss
  // mounten, damit die Aufzeichnung übernommen und das Fazit gezeigt wird.
  const [open, setOpen] = useState(guestContinuationToken !== null);

  // Den verbrauchten Marker aus der Adressleiste nehmen, sobald er
  // weitergereicht ist: er ist einmalig einlösbar, ein Neuladen derselben
  // URL würde also nichts mehr übernehmen, aber den Abschnitt trotzdem
  // aufklappen und eine neue Aufzeichnung starten. history.replaceState
  // statt router.replace, weil letzteres diese Komponente samt "open"-Zustand
  // (und einer eventuell laufenden Aufzeichnung) neu rendern würde.
  useEffect(() => {
    if (!guestContinuationToken) return;
    window.history.replaceState(null, "", `/strecken/${route.id}`);
  }, [guestContinuationToken, route.id]);

  if (!open) {
    return (
      <div className="flex justify-center border-t border-border pt-6">
        {/* Handgebaute Pille durch die Design-System-Variante ersetzt (Kernregel
            14): dieselbe Höhe wie zuvor, aber jetzt aus derselben Quelle wie
            die übrigen Bedienelemente der Aufzeichnung — px-10 statt px-6
            bleibt als Zusatz, weil diese eine Schaltfläche bewusst breiter
            steht als die im Vollbild. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonVariants({ variant: "accent", size: "lg", className: "px-10" })}
        >
          Strecke starten
        </button>
      </div>
    );
  }

  return (
    <LiveTrackingForm
      route={route}
      kontextStrecken={kontextStrecken}
      userId={userId}
      vehicles={vehicles}
      personalBestSeconds={personalBestSeconds}
      guestContinuationToken={guestContinuationToken}
      maxPhotos={maxPhotos}
      onExit={() => setOpen(false)}
    />
  );
}
