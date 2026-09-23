"use client";

import { useEffect, useState } from "react";
import LiveTrackingForm from "@/components/LiveTrackingForm";
import { useAufzeichnung } from "@/components/AufzeichnungsKontext";
import type { KartenStrecke, RouteGeoJSON, Vehicle } from "@/types/database";
import { buttonVariants } from "@/components/ui/Button";
import { GUEST_TRACKING_USER_ID, loadTrackingSnapshot } from "@/lib/trackingStorage";

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

  // Während der Aufzeichnung läuft auf dem Schirm genau eine Karte: die des
  // Aufzeichnungs-Dialogs. Die Detailkarte dahinter hängt sich über den
  // AufzeichnungProvider aus (siehe AufzeichnungsKontext.tsx) — sonst liefen
  // zwei WebGL-Karten gleichzeitig, und genau das machte die
  // Streckenaufzeichnung auf dem Telefon zäh, während die freie Fahrt mit
  // einer Karte flüssig blieb.
  const { setzeAktiv } = useAufzeichnung();
  useEffect(() => {
    setzeAktiv(open);
    return () => setzeAktiv(false);
  }, [open, setzeAktiv]);

  // Den verbrauchten Marker aus der Adressleiste nehmen, sobald er
  // weitergereicht ist: er ist einmalig einlösbar, ein Neuladen derselben
  // URL würde also nichts mehr übernehmen, aber den Abschnitt trotzdem
  // aufklappen und eine neue Aufzeichnung starten. history.replaceState
  // statt router.replace, weil letzteres diese Komponente samt "open"-Zustand
  // (und einer eventuell laufenden Aufzeichnung) neu rendern würde.
  // Eine offene Aufzeichnung auf dieser Strecke klappt den Abschnitt von
  // selbst auf. Hierher führt der Streifen "Aufzeichnung unterbrochen"
  // (components/OffeneAufzeichnung.tsx) — ohne das stünde man nach dem Tipp
  // darauf vor einer Streckenseite, auf der von der Fahrt nichts zu sehen
  // ist, und erst "Strecke fahren" hätte sie wiederaufgenommen. Das ist
  // dieselbe Wiederaufnahme wie nach einem Tab-Kill, nur ohne den Umweg:
  // LiveTrackingForm findet den Snapshot beim Mount und setzt ihn fort.
  useEffect(() => {
    if (open) return;
    const snapshot = loadTrackingSnapshot(userId ?? GUEST_TRACKING_USER_ID, route.id);
    if (!snapshot || (snapshot.phase === "tracking" && !snapshot.hasStarted)) return;
    // In einem Callback statt synchron im Effekt — dasselbe Muster wie der
    // Wiederherstellungs-Effekt in useRideRecorder.ts.
    const timeout = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(timeout);
    // Nur beim Mount: ein späteres Einklappen über onExit ist gewollt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!guestContinuationToken) return;
    window.history.replaceState(null, "", `/strecken/${route.id}`);
  }, [guestContinuationToken, route.id]);

  if (!open) {
    return (
      <div className="sticky bottom-0 z-10 -mx-1 px-1 pt-2 pb-1">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-background/95 p-3 shadow-elevated backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Strecke fahren</p>
            {/* "ohne Konto" nur für Gäste: angemeldet ist der Satz keine
                Information mehr, sondern eine Falschaussage über den Zustand. */}
            <p className="truncate text-xs text-muted">
              {route.laenge_km.toFixed(0)} km · Zeitmessung startet am Startpunkt
              {userId === null && " · auch ohne Konto"}
            </p>
          </div>
          {/* Handgebaute Pille durch die Design-System-Variante ersetzt (Kernregel
              14): dieselbe Höhe wie zuvor, aber jetzt aus derselben Quelle wie
              die übrigen Bedienelemente der Aufzeichnung — px-10 statt px-6
              bleibt als Zusatz, weil diese eine Schaltfläche bewusst breiter
              steht als die im Vollbild. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={buttonVariants({ variant: "accent", size: "lg", className: "shrink-0 px-8" })}
          >
            Strecke fahren
          </button>
        </div>
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
