"use client";

import { useActionState, useState } from "react";
import { addVehicle, type VehicleFormState } from "@/lib/actions/vehicles";
import { Input, fieldClassName } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import MotorklasseBadge from "@/components/MotorklasseBadge";
import { fahrzeugtypdefinition, motorklasseFor, psInKw } from "@/lib/motorklassen";
import type { FahrzeugTyp } from "@/types/database";

const initialState: VehicleFormState = { error: null };

// Eingabe mit Komma als Dezimaltrennzeichen zulassen — auf einem Schweizer
// Handy ist das die naheliegende Eingabe. Dieselbe Umwandlung macht
// lib/actions/vehicles.ts noch einmal serverseitig; hier dient sie nur der
// Klassenvorschau.
function zahl(wert: string): number | null {
  const bereinigt = wert.trim().replace(",", ".");
  if (!bereinigt) return null;
  const n = Number(bereinigt);
  return Number.isFinite(n) ? n : null;
}

export default function NeuesFahrzeugForm({ nextHref }: { nextHref?: string } = {}) {
  const [state, formAction, pending] = useActionState(addVehicle, initialState);
  const [typ, setTyp] = useState<FahrzeugTyp>("auto");
  const [hubraum, setHubraum] = useState("");
  const [leistung, setLeistung] = useState("");

  // Beim Auto wird in PS eingegeben, beim Motorrad in kW — Begründung in
  // lib/motorklassen.ts, Abschnitt EINHEITEN. Gespeichert wird beides als
  // kW, die Umrechnung macht serverseitig lib/actions/vehicles.ts noch
  // einmal; hier dient sie nur der Klassenvorschau.
  const einheit = fahrzeugtypdefinition(typ).leistungseinheit;
  const eingegebeneLeistung = zahl(leistung);
  const leistungKw =
    eingegebeneLeistung === null
      ? null
      : einheit === "PS"
        ? psInKw(eingegebeneLeistung)
        : eingegebeneLeistung;

  // Die Klasse schon beim Tippen zeigen: sie ist der einzige Zweck der zwei
  // Felder, und ohne Rückmeldung bliebe unklar, wofür man sie ausfüllt.
  const klasse = motorklasseFor({
    typ,
    hubraum_ccm: zahl(hubraum),
    leistung_kw: leistungKw,
  });

  return (
    <>
      <h1 className="text-display font-semibold">Fahrzeug hinzufügen</h1>
      <form action={formAction} className="flex flex-col gap-4">
        {nextHref && <input type="hidden" name="next" value={nextHref} />}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Typ
          <select
            name="typ"
            required
            value={typ}
            onChange={(e) => {
              setTyp(e.target.value as FahrzeugTyp);
              // Die Zahl im Leistungsfeld bedeutet je nach Typ etwas
              // anderes. Sie stehen zu lassen hiesse, aus 150 PS
              // stillschweigend 150 kW zu machen — und damit aus einem
              // Mittelklassewagen ein Fahrzeug der obersten Klasse.
              setLeistung("");
            }}
            className={fieldClassName()}
          >
            <option value="auto">Auto</option>
            <option value="motorrad">Motorrad</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Marke
          <Input type="text" name="marke" required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Modell
          <Input type="text" name="modell" required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Getriebe
          <select name="getriebe" required defaultValue="manuell" className={fieldClassName()}>
            <option value="manuell">Manuell</option>
            <option value="automatik">Automatik</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Baujahr (optional)
          <Input type="number" name="baujahr" min={1900} max={2100} />
        </label>

        {/* Hubraum nur beim Motorrad: er trennt dort A1 von A 35 kW. Für ein
            Auto geht er in keine Klasse ein und wäre ein Feld ohne Wirkung. */}
        {typ === "motorrad" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Hubraum in cm³ (optional)
            <Input
              type="number"
              name="hubraum_ccm"
              min={1}
              max={10000}
              inputMode="numeric"
              value={hubraum}
              onChange={(e) => setHubraum(e.target.value)}
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Leistung in {einheit} (optional)
          <Input
            type="text"
            // Der Feldname trägt die Einheit: die Server Action liest das
            // Feld, das zum Typ gehört, und kann die Einheit deshalb nicht
            // verwechseln.
            name={einheit === "PS" ? "leistung_ps" : "leistung_kw"}
            inputMode="decimal"
            value={leistung}
            onChange={(e) => setLeistung(e.target.value)}
          />
          <span className="text-xs font-normal text-muted">
            {einheit === "PS"
              ? "Die Zahl, mit der das Auto beworben wird — im Fahrzeugausweis steht sie als kW daneben."
              : "Wie im Fahrzeugausweis. Die Kategorien A1 und A 35 kW sind in kW festgelegt."}
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <MotorklasseBadge klasse={klasse} regelAnzeigen />
          <p className="text-xs text-muted">
            {klasse
              ? "In dieser Klasse wird jede Fahrt mit diesem Fahrzeug gewertet."
              : "Ohne Leistungsangabe zählen deine Fahrten weiter in der Gesamtwertung, aber in keiner Klassenliste."}
          </p>
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Speichern…" : "Speichern"}
        </Button>
      </form>
    </>
  );
}
