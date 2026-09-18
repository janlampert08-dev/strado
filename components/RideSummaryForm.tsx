"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { addVehicleInline } from "@/lib/actions/vehicles";
import { GlobeIcon, LockIcon } from "@/components/VisibilityIcons";
import MultiPhotoInput from "@/components/MultiPhotoInput";
import type { FahrzeugTyp, Vehicle } from "@/types/database";
import MotorklasseBadge from "@/components/MotorklasseBadge";
import {
  fahrzeugtypdefinition,
  motorklasseFor,
  motorklasseLabel,
  psInKw,
} from "@/lib/motorklassen";
import { ChevronDown } from "lucide-react";
import { fieldClassName } from "@/components/ui/Input";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { chipClassName } from "@/components/motorklassenChipStil";
import { buttonVariants, textAktionClassName } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import { ConfirmDialog } from "@/components/ui/Dialog";
import Select from "@/components/ui/Select";

export const MAX_NOTIZ_LENGTH = 280;

/**
 * Die eine Geometrie für jeden Abschnitt dieses Formulars: Trennlinie oben,
 * 16 px Luft darunter, 8 px zwischen Marke und Bedienelement.
 *
 * Exportiert, weil FreeRideForm einen eigenen Abschnitt als children
 * einhängt (den Titel der freien Fahrt) — ohne diese Klasse schriebe er
 * seine eigene, und genau daran krankte das Formular:
 *
 *   Fahrzeug        keine Trennlinie, gap-2
 *   Sichtbarkeit    Trennlinie, pt-4, gap-1
 *   Notiz & Fotos   Trennlinie, kein pt
 *   Notiz (innen)   NOCH EINE Trennlinie, 8 px unter der vorigen
 *   Titel (extern)  keine Trennlinie, gap-1
 *
 * Fünf Abschnitte, fünf Abstände, und zwei Linien mit 24 px Abstand
 * untereinander, sobald die Klappe offen war. Auf einem 390-px-Schirm liest
 * sich das nicht als Gliederung, sondern als Fehler.
 */
export const FAZIT_ABSCHNITT = "flex flex-col gap-2 border-t border-border pt-4 text-sm";

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
  ticketJson = "null",
  visibility,
  visibilityNote,
  isPublic,
  onIsPublicChange,
  onSubmit,
  onDiscard,
  onResume,
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
  /** Fahrtstart-Ticket als JSON (lib/fahrtstart.ts). "null", wenn keines vorliegt. */
  ticketJson?: string;
  // null: keine Auswahl anbieten (dann greift visibilityNote als Erklärung).
  visibility: VisibilityChoice | null;
  visibilityNote?: string;
  isPublic: boolean;
  onIsPublicChange: (next: boolean) => void;
  onSubmit: () => void;
  onDiscard: () => void;
  /** "Weiter aufzeichnen": die Fahrt war nicht zu Ende, nur der Knopf wurde
   *  gedrückt. Ohne diesen Weg blieb nach einem Fehlgriff nur Speichern
   *  oder Verwerfen — und beides beendet die Fahrt endgültig. */
  onResume?: () => void;
  // Zusätzliche Felder oberhalb der Fahrzeugwahl (z.B. der Titel einer
  // freien Fahrt).
  children?: ReactNode;
}) {
  const [notiz, setNotiz] = useState("");
  const [vehicleList, setVehicleList] = useState<Vehicle[]>(vehicles);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicleTyp, setNewVehicleTyp] = useState<FahrzeugTyp>("auto");
  const [newVehicleMarke, setNewVehicleMarke] = useState("");
  const [newVehicleModell, setNewVehicleModell] = useState("");
  const [newVehicleGetriebe, setNewVehicleGetriebe] = useState("manuell");
  const [newVehicleBaujahr, setNewVehicleBaujahr] = useState("");
  const [newVehicleHubraum, setNewVehicleHubraum] = useState("");
  const [newVehicleLeistung, setNewVehicleLeistung] = useState("");
  const [addVehicleError, setAddVehicleError] = useState<string | null>(null);
  const [addVehiclePending, startAddVehicleTransition] = useTransition();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [submitted, setSubmitted] = useState(false);
  const lastSubmitFormDataRef = useRef<FormData | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  // Die Leistung wird beim Auto in PS eingegeben, beim Motorrad in kW
  // (Begründung in lib/motorklassen.ts, Abschnitt EINHEITEN). Gespeichert
  // wird beides als kW; diese Umrechnung dient nur der Klassenvorschau
  // darunter, die Server Action rechnet unabhängig davon noch einmal.
  const neueFahrzeugEinheit = fahrzeugtypdefinition(newVehicleTyp).leistungseinheit;
  const neueFahrzeugLeistungEingabe = newVehicleLeistung.trim()
    ? Number(newVehicleLeistung.trim().replace(",", "."))
    : null;
  const neueFahrzeugLeistungKw =
    neueFahrzeugLeistungEingabe === null || !Number.isFinite(neueFahrzeugLeistungEingabe)
      ? null
      : neueFahrzeugEinheit === "PS"
        ? psInKw(neueFahrzeugLeistungEingabe)
        : neueFahrzeugLeistungEingabe;

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
    // Hubraum nur beim Motorrad: er trennt dort A1 von A 35 kW und geht bei
    // einem Auto in keine Klasse ein.
    formData.set("hubraum_ccm", newVehicleTyp === "motorrad" ? newVehicleHubraum : "");
    // Beim Auto in PS, beim Motorrad in kW — der Feldname trägt die Einheit,
    // siehe lib/motorklassen.ts (Abschnitt EINHEITEN). Die Umrechnung auf
    // den gespeicherten kW-Wert macht die Server Action.
    formData.set(
      neueFahrzeugEinheit === "PS" ? "leistung_ps" : "leistung_kw",
      newVehicleLeistung,
    );

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
      setNewVehicleHubraum("");
      setNewVehicleLeistung("");
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

  // Klasse des gewählten Fahrzeugs; undefined heisst "kein Fahrzeug
  // gewählt" und unterdrückt die Pille ganz, null heisst "gewählt, aber
  // ohne Leistungsangabe" und zeigt sie als "Ohne Klasse".
  const gewaehltesFahrzeug = vehicleList.find((v) => v.id === selectedVehicleId);
  const gewaehlteKlasse = gewaehltesFahrzeug ? motorklasseFor(gewaehltesFahrzeug) : undefined;
  const neueFahrzeugKlasse = motorklasseFor({
    typ: newVehicleTyp,
    hubraum_ccm: newVehicleHubraum.trim() ? Number(newVehicleHubraum) : null,
    leistung_kw: neueFahrzeugLeistungKw,
  });

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
      {/* Der serverseitig aufgezeichnete Start. Ohne ihn wird die Fahrt mit
          dauer_quelle = "trail" gespeichert und zählt nicht für die
          Bestenliste (siehe lib/actions/completions.ts). */}
      <input type="hidden" name="fahrt_start" value={ticketJson} />

      {children}

      <div className={FAZIT_ABSCHNITT}>
        {/* Ohne font-mono: die Schwesterzeile "Sichtbarkeit" weiter unten
            trug es nie, und beide sind dieselbe Rolle. */}
        <SectionHeading as="h3" groesse="xs">
          Fahrzeug
        </SectionHeading>
        {/* Chips statt Auswahlliste. Die meisten Konten haben ein bis drei
            Fahrzeuge; für die ist eine native Auswahlliste ein Umweg über
            einen Systemdialog, um zwischen zwei Dingen zu wählen, die beide
            auf den Schirm passen. Mit Chips sieht man die Wahl, ohne sie zu
            öffnen — und trifft sie mit einem Tipp von 44 px.
            Siehe docs/design-vereinfachung.md, Anhang B3.

            Der Wert reist weiter über ein hidden input, das Formular ändert
            sich also nicht: fahrzeug_id kommt unverändert in der FormData an,
            und der Server entscheidet wie bisher. */}
        {vehicleList.length > 0 && (
          <>
            <input type="hidden" name="fahrzeug_id" value={selectedVehicleId} />
            <div role="group" aria-label="Fahrzeug dieser Fahrt" className="flex flex-wrap gap-2">
              {vehicleList.map((v) => {
                const klasse = motorklasseFor(v);
                const gewaehlt = selectedVehicleId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={gewaehlt}
                    onClick={() => setSelectedVehicleId(gewaehlt ? "" : v.id)}
                    className={chipClassName(gewaehlt, true)}
                  >
                    {v.marke} {v.modell}
                    {klasse && (
                      <span className={gewaehlt ? "opacity-70" : "opacity-80"}>
                        {" · "}
                        {motorklasseLabel(klasse)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {/* Vor dem Speichern sichtbar machen, in welcher Klasse diese Fahrt
            antritt — die Klasse wird beim Speichern eingefroren und lässt
            sich danach nicht mehr wechseln. */}
        {gewaehlteKlasse !== undefined && (
          <MotorklasseBadge klasse={gewaehlteKlasse} regelAnzeigen />
        )}
        {vehicleList.length === 0 && <input type="hidden" name="fahrzeug_id" value="" />}

        {!showAddVehicle ? (
          <button
            type="button"
            onClick={() => setShowAddVehicle(true)}
            className={textAktionClassName({ className: "self-start" })}
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
              <Select
                value={newVehicleTyp}
                onChange={(e) => {
                  setNewVehicleTyp(e.target.value as FahrzeugTyp);
                  // Die Zahl im Leistungsfeld bedeutet je nach Typ etwas
                  // anderes — stehen zu lassen hiesse, aus 150 PS still
                  // 150 kW zu machen.
                  setNewVehicleLeistung("");
                }}
                className={fieldClassName()}
              >
                <option value="auto">Auto</option>
                <option value="motorrad">Motorrad</option>
              </Select>
              <Select
                value={newVehicleGetriebe}
                onChange={(e) => setNewVehicleGetriebe(e.target.value)}
              >
                <option value="manuell">Manuell</option>
                <option value="automatik">Automatik</option>
              </Select>
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
              className={fieldClassName()}
            />
            {newVehicleTyp === "motorrad" && (
              <input
                type="number"
                placeholder="Hubraum in cm³ (optional)"
                min={1}
                max={10000}
                inputMode="numeric"
                value={newVehicleHubraum}
                onChange={(e) => setNewVehicleHubraum(e.target.value)}
                className={fieldClassName()}
              />
            )}
            <input
              type="text"
              placeholder={`Leistung in ${neueFahrzeugEinheit} (optional)`}
              inputMode="decimal"
              value={newVehicleLeistung}
              onChange={(e) => setNewVehicleLeistung(e.target.value)}
              className={fieldClassName()}
            />
            <MotorklasseBadge klasse={neueFahrzeugKlasse} regelAnzeigen />
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

      <div className={FAZIT_ABSCHNITT}>
        <SectionHeading as="h3" groesse="xs">Sichtbarkeit</SectionHeading>
        {visibility ? (
          <>
            {/* Die folgenreichste Entscheidung dieses Screens — geht die Fahrt
                in Feed und Bestenlisten oder nicht — war rein visuell markiert.
                role="group" plus aria-pressed macht Auswahl und
                Zusammengehörigkeit für Hilfstechnik ablesbar. */}
            {/* Eine Fassung statt einer eigenen: dasselbe Bedienelement
                stand in NeueStreckeForm noch einmal, mit leicht anderen
                Klassen. Siehe components/ui/SegmentedControl.tsx. */}
            <SegmentedControl
              label="Sichtbarkeit der Fahrt"
              wert={isPublic ? "oeffentlich" : "privat"}
              onChange={(w: "privat" | "oeffentlich") => onIsPublicChange(w === "oeffentlich")}
              segmente={[
                {
                  wert: "privat" as const,
                  label: (
                    <>
                      <LockIcon className="h-4 w-4" />
                      Privat
                    </>
                  ),
                },
                {
                  wert: "oeffentlich" as const,
                  label: (
                    <>
                      <GlobeIcon className="h-4 w-4" />
                      Öffentlich
                    </>
                  ),
                  gesperrt: visibility.publicDisabled,
                  hinweis: visibility.publicDisabledHint,
                },
              ]}
            />
            <p className="text-sm text-muted">
              {visibility.publicDisabled
                ? visibility.publicDisabledHint
                : isPublic
                  ? visibility.publicHint
                  : visibility.privateHint}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <LockIcon className="h-4 w-4 shrink-0" />
            {visibilityNote}
          </p>
        )}
      </div>

      {/* Notiz und Fotos hinter einer Klappe, standardmässig zu.

          Dieser Schirm erscheint in dem Moment, in dem jemand am
          Strassenrand steht, im Helm, und wissen will, dass die Fahrt
          gespeichert ist. Davor standen bisher sechs Abschnitte, und der
          Speichern-Knopf lag unter der Falz. Beides hier ist ausdrücklich
          optional — die Notiz sagt es sogar im eigenen Label —, und beides
          lässt sich auf der Fahrtseite nachtragen.

          Die Sichtbarkeit bleibt offen: sie entscheidet, ob die Fahrt in
          Feed und Bestenliste geht, und gehört nicht hinter eine Klappe.
          Siehe docs/design-vereinfachung.md, Anhang B3. */}
      {/* group, weil das Chevron unten group-open:rotate-180 trägt — ohne
          die Klasse am <details> drehte es sich nie.

          Die Trennlinie ist dieselbe wie an den Abschnitten oben; das pt
          fehlt hier bewusst, weil die Summary mit min-h-11 ihre eigene
          Höhe mitbringt und der Text darin mittig sitzt. */}
      <details className="group border-t border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <span>
            Notiz &amp; Fotos <span className="font-normal text-muted">— optional</span>
          </span>
          <ChevronDown
            className="h-4 w-4 text-muted transition-transform duration-fast group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        {/* KEINE zweite Trennlinie hier. Sie stand bis hierher am Notiz-Feld
            und lag damit 24 px unter der des <details> — zwei Haarlinien
            dicht untereinander, sobald die Klappe offen war. Der Inhalt
            einer Klappe ist kein neuer Abschnitt, er gehört zu der Marke
            darüber. */}
        <div className="flex flex-col gap-4 pt-1 pb-4">
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-baseline justify-between">
            <SectionHeading as="label" groesse="xs" htmlFor="tracking-notiz">
              Notiz (optional)
            </SectionHeading>
            <span className="text-xs tabular-nums text-muted">
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
          <MultiPhotoInput name="foto" id="tracking-foto" maxPhotos={maxPhotos} />
        </div>
      </details>

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

      {/* Der Speichern-Knopf klebt am unteren Rand, statt ans Ende einer
          langen Spalte zu rutschen. Vorher lag er hinter sechs Abschnitten
          und damit auf dem Telefon unter der Falz — in genau dem Moment, in
          dem jemand im Helm am Strassenrand steht und nur wissen will, dass
          es gespeichert ist. NeueStreckeForm.tsx macht es an derselben
          Stelle seit jeher so; hier fehlte es.

          sticky statt fixed: das Formular liegt in einem eigenen
          Scroll-Container (FullscreenDialog), und fixed würde aus ihm
          ausbrechen. Der negative Aussenabstand hebt das Polster des
          Containers auf, damit der Streifen bis an die Kanten läuft.

          size="lg" (52 px) und volle Breite: dieselbe Begründung wie beim
          Beenden-Knopf eine Ansicht davor — hier wird mit Handschuhen
          getippt. */}
      <div className="sticky bottom-0 -mx-5 mt-2 flex flex-col gap-2 border-t border-border bg-background px-5 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] sm:-mx-6 sm:px-6">
        <button
          type="submit"
          disabled={pending}
          className={buttonVariants({ variant: "accent", size: "lg", className: "w-full" })}
        >
          {pending ? "Speichern…" : "Fahrt speichern"}
        </button>
        {/* FORTSETZEN UND VERWERFEN SEHEN NICHT MEHR GLEICH AUS. Beide
            standen als gleich grosse graue Textknöpfe nebeneinander — der
            eine führt die Fahrt weiter, der andere löscht sie endgültig, und
            auf dem Telefon lagen sie einen Daumen auseinander. Fortsetzen ist
            jetzt ein umrandeter Knopf, Verwerfen eine einzelne leise Zeile in
            der Gefahrenfarbe, mit Abstand darunter. */}
        {onResume && (
          <button
            type="button"
            onClick={onResume}
            // Während des Speicherns gesperrt: wer jetzt weiterzeichnete,
            // bekäme nach der Antwort Snapshot-Löschung und Weiterleitung
            // mitten in die neue Aufzeichnung — auf ein Ticket, das der
            // Server gerade eingelöst hat.
            disabled={pending}
            className={buttonVariants({ variant: "secondary", className: "w-full" })}
          >
            Weiter aufzeichnen
          </button>
        )}
        <button
          type="button"
          onClick={() => setDiscardConfirmOpen(true)}
          disabled={pending}
          className="mt-1 min-h-11 self-center text-sm text-muted transition-colors duration-fast hover:text-danger disabled:opacity-50"
        >
          Fahrt verwerfen
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
