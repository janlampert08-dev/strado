"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { addVehicleInline } from "@/lib/actions/vehicles";
import { GlobeIcon, LockIcon } from "@/components/VisibilityIcons";
import MultiPhotoInput from "@/components/MultiPhotoInput";
import type { Vehicle } from "@/types/database";
import { fieldClassName } from "@/components/ui/Input";
import { buttonVariants } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";

export const MAX_NOTIZ_LENGTH = 280;

export interface VisibilityChoice {
  // Verhindert die Auswahl "öffentlich" (z.B. Deckungsgrad unterschritten).
  publicDisabled: boolean;
  publicDisabledHint?: string;
  publicHint: string;
  privateHint: string;
}

// Das Fazit-Formular, das sich beide Aufzeichnungsarten teilen: Fahrzeug
// (inkl. Anlegen ohne Navigation), Notiz, Sichtbarkeit, Fotos, Speichern.
// Die Kennzahlen darüber und die Server Action selbst kommen von der
// jeweiligen Aufzeichnungs-Komponente (LiveTrackingForm/FreeRideForm), weil
// sie sich unterscheiden — alles andere ist identisch und lag vorher
// doppelt zu werden drohend nur in LiveTrackingForm.
export default function RideSummaryForm({
  formAction,
  pending,
  error,
  vehicles,
  trailJson,
  visibility,
  visibilityNote,
  isPublic,
  onIsPublicChange,
  onSubmit,
  onDiscard,
  maxPhotos,
  children,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  /** Fotos pro Fahrt: 6 kostenlos, 12 mit Premium (lib/premium.ts). Kommt
   *  von der Seite, weil der Abo-Zustand nur serverseitig bekannt ist. */
  maxPhotos: number;
  error: string | null;
  vehicles: Vehicle[];
  trailJson: string;
  // null: keine Auswahl anbieten (dann greift visibilityNote als Erklärung).
  visibility: VisibilityChoice | null;
  visibilityNote?: string;
  isPublic: boolean;
  onIsPublicChange: (next: boolean) => void;
  onSubmit: () => void;
  onDiscard: () => void;
  // Zusätzliche Felder oberhalb der Fahrzeugwahl (z.B. der Titel einer
  // freien Fahrt).
  children?: ReactNode;
}) {
  const [notiz, setNotiz] = useState("");
  const [vehicleList, setVehicleList] = useState<Vehicle[]>(vehicles);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicleTyp, setNewVehicleTyp] = useState("auto");
  const [newVehicleMarke, setNewVehicleMarke] = useState("");
  const [newVehicleModell, setNewVehicleModell] = useState("");
  const [newVehicleGetriebe, setNewVehicleGetriebe] = useState("manuell");
  const [newVehicleBaujahr, setNewVehicleBaujahr] = useState("");
  const [addVehicleError, setAddVehicleError] = useState<string | null>(null);
  const [addVehiclePending, startAddVehicleTransition] = useTransition();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [submitted, setSubmitted] = useState(false);
  const lastSubmitFormDataRef = useRef<FormData | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  // Fahrzeug-Liste lokal gehalten und ohne Navigation ergänzbar — ein
  // <a target="_blank"> zu /profil/fahrzeuge/neu verlässt sich darauf, dass
  // der Browser wirklich einen neuen Tab öffnet; tut er das nicht (z.B.
  // manche mobilen/PWA-Kontexte), navigiert der aktuelle Tab weg und die
  // komplette, nur im Speicher gehaltene Aufzeichnung geht verloren.
  function handleAddVehicle() {
    setAddVehicleError(null);
    const formData = new FormData();
    formData.set("typ", newVehicleTyp);
    formData.set("marke", newVehicleMarke);
    formData.set("modell", newVehicleModell);
    formData.set("getriebe", newVehicleGetriebe);
    formData.set("baujahr", newVehicleBaujahr);

    startAddVehicleTransition(async () => {
      const result = await addVehicleInline(formData);
      if (result.error || !result.vehicle) {
        setAddVehicleError(result.error ?? "Fahrzeug konnte nicht gespeichert werden.");
        return;
      }
      setVehicleList((list) => [...list, result.vehicle as Vehicle]);
      setSelectedVehicleId(result.vehicle.id);
      setShowAddVehicle(false);
      setNewVehicleMarke("");
      setNewVehicleModell("");
      setNewVehicleBaujahr("");
    });
  }

  // Online-Status verfolgen, um beim Speichern ohne Verbindung Bescheid zu
  // geben, statt einen kryptischen Fehler zu zeigen — die Fahrt selbst ist
  // zu diesem Zeitpunkt bereits lokal gesichert (Snapshot im Recorder).
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Sobald die Verbindung zurückkommt, einen zuvor fehlgeschlagenen
  // Speicherversuch automatisch wiederholen, statt den Nutzer manuell
  // erneut auf "Fahrt speichern" tippen zu lassen.
  useEffect(() => {
    if (isOnline && submitted && error && lastSubmitFormDataRef.current) {
      formAction(lastSubmitFormDataRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Für den automatischen Resend, falls dieser Versuch mangels
        // Verbindung fehlschlägt (siehe useEffect oben, [isOnline]).
        lastSubmitFormDataRef.current = new FormData(e.currentTarget);
        setSubmitted(true);
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="ist_oeffentlich" value={isPublic ? "true" : "false"} />
      {/* distanz_km/dauer_sekunden/abdeckung_prozent werden serverseitig aus
          trail neu berechnet (lib/actions/completions.ts) — hier nur der
          aufgezeichnete GPS-Trail als Rohdaten, keine vom Client berechneten
          Werte, denen vertraut würde. */}
      <input type="hidden" name="trail" value={trailJson} />

      {children}

      <div className="flex flex-col gap-2 text-sm">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Fahrzeug</h3>
        {vehicleList.length > 0 && (
          <select
            name="fahrzeug_id"
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            className={fieldClassName()}
          >
            <option value="">—</option>
            {vehicleList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.marke} {v.modell}
              </option>
            ))}
          </select>
        )}
        {vehicleList.length === 0 && <input type="hidden" name="fahrzeug_id" value="" />}

        {!showAddVehicle ? (
          <button
            type="button"
            onClick={() => setShowAddVehicle(true)}
            className="self-start text-sm font-medium text-accent hover:underline"
          >
            + Fahrzeug hinzufügen
          </button>
        ) : (
          // Bewusst kein verschachteltes <form> — dieser Block liegt
          // innerhalb des äusseren Fahrt-Speichern-Formulars, und HTML
          // erlaubt keine geschachtelten Formulare. handleAddVehicle baut
          // die FormData manuell und ruft die Server Action direkt auf.
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newVehicleTyp}
                onChange={(e) => setNewVehicleTyp(e.target.value)}
                className={fieldClassName()}
              >
                <option value="auto">Auto</option>
                <option value="motorrad">Motorrad</option>
              </select>
              <select
                value={newVehicleGetriebe}
                onChange={(e) => setNewVehicleGetriebe(e.target.value)}
                className={fieldClassName()}
              >
                <option value="manuell">Manuell</option>
                <option value="automatik">Automatik</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="Marke"
              value={newVehicleMarke}
              onChange={(e) => setNewVehicleMarke(e.target.value)}
              className={fieldClassName()}
            />
            <input
              type="text"
              placeholder="Modell"
              value={newVehicleModell}
              onChange={(e) => setNewVehicleModell(e.target.value)}
              className={fieldClassName()}
            />
            <input
              type="number"
              placeholder="Baujahr (optional)"
              min={1900}
              max={2100}
              value={newVehicleBaujahr}
              onChange={(e) => setNewVehicleBaujahr(e.target.value)}
              className={fieldClassName("font-mono")}
            />
            {addVehicleError && (
              <p role="alert" className="text-xs text-danger">
                {addVehicleError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddVehicle}
                disabled={addVehiclePending || !newVehicleMarke.trim() || !newVehicleModell.trim()}
                className={buttonVariants({ size: "sm" })}
              >
                {addVehiclePending ? "Speichern…" : "Speichern"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddVehicle(false);
                  setAddVehicleError(null);
                }}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="tracking-notiz"
            className="text-xs font-semibold tracking-wide text-muted uppercase"
          >
            Notiz (optional)
          </label>
          <span className="font-mono text-xs tabular-nums text-muted">
            {notiz.length}/{MAX_NOTIZ_LENGTH}
          </span>
        </div>
        <textarea
          id="tracking-notiz"
          name="notiz"
          rows={2}
          maxLength={MAX_NOTIZ_LENGTH}
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          placeholder="z.B. nasse Fahrbahn, mit der Ducati…"
          className={fieldClassName()}
        />
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-4 text-sm">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Sichtbarkeit</h3>
        {visibility ? (
          <>
            {/* Die folgenreichste Entscheidung dieses Screens — geht die Fahrt
                in Feed und Bestenlisten oder nicht — war rein visuell markiert.
                role="group" plus aria-pressed macht Auswahl und
                Zusammengehörigkeit für Hilfstechnik ablesbar. */}
            <div className="flex gap-2" role="group" aria-label="Sichtbarkeit der Fahrt">
              <button
                type="button"
                aria-pressed={!isPublic}
                onClick={() => onIsPublicChange(false)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-fast ${
                  !isPublic
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted hover:border-border-strong"
                }`}
              >
                <LockIcon className="h-4 w-4" />
                Privat
              </button>
              <button
                type="button"
                aria-pressed={isPublic}
                onClick={() => onIsPublicChange(true)}
                disabled={visibility.publicDisabled}
                title={visibility.publicDisabled ? visibility.publicDisabledHint : undefined}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-40 ${
                  isPublic
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted hover:enabled:border-border-strong"
                }`}
              >
                <GlobeIcon className="h-4 w-4" />
                Öffentlich
              </button>
            </div>
            <p className="text-xs text-muted">
              {visibility.publicDisabled
                ? visibility.publicDisabledHint
                : isPublic
                  ? visibility.publicHint
                  : visibility.privateHint}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <LockIcon className="h-4 w-4 shrink-0" />
            {visibilityNote}
          </p>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <MultiPhotoInput name="foto" id="tracking-foto" maxPhotos={maxPhotos} />
      </div>

      {!isOnline && (
        <p className="text-sm text-muted">
          Du bist offline — die Fahrt ist lokal gespeichert und wird automatisch übertragen, sobald
          wieder Verbindung besteht.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={buttonVariants({ variant: "accent" })}>
          {pending ? "Speichern…" : "Fahrt speichern"}
        </button>
        <button
          type="button"
          onClick={() => setDiscardConfirmOpen(true)}
          className="px-2 py-2 text-sm text-muted transition-colors duration-fast hover:text-foreground"
        >
          Verwerfen
        </button>
      </div>

      <ConfirmDialog
        open={discardConfirmOpen}
        title="Fahrt verwerfen?"
        description="Die aufgezeichnete Fahrt wurde noch nicht gespeichert und geht dabei endgültig verloren."
        confirmLabel="Verwerfen"
        variant="danger"
        onConfirm={onDiscard}
        onCancel={() => setDiscardConfirmOpen(false)}
      />
    </form>
  );
}
