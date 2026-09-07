"use client";

import { useActionState } from "react";
import { updateVisibilitySettings, type ProfileActionState } from "@/lib/actions/profile";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Switch from "@/components/ui/Switch";
import { fieldClassName } from "@/components/ui/Input";
import { PRIVACY_RADIUS_OPTIONS } from "@/lib/track";

const initialState: ProfileActionState = { error: null };

export interface VisibilityFlags {
  zeigtFahrzeuge: boolean;
  zeigtAvatar: boolean;
  zeigtPaesse: boolean;
  zeigtHoehenmeter: boolean;
  zeigtDistanz: boolean;
  zeigtFollowerListe: boolean;
}

export interface VisibilitySettingsProps extends VisibilityFlags {
  privatzoneRadiusM: number;
}

const PRIVACY_RADIUS_LABELS: Record<number, string> = {
  0: "Aus — vollständiger Track sichtbar",
  100: "100 m um Start und Ziel",
  200: "200 m um Start und Ziel",
  500: "500 m um Start und Ziel",
};

const FIELDS: {
  name: keyof VisibilityFlags;
  formKey: string;
  label: string;
  description?: string;
}[] = [
  { name: "zeigtAvatar", formKey: "zeigt_avatar", label: "Profilbild zeigen" },
  { name: "zeigtFahrzeuge", formKey: "zeigt_fahrzeuge", label: "Fahrzeuge zeigen" },
  { name: "zeigtPaesse", formKey: "zeigt_paesse", label: "Anzahl befahrener Pässe zeigen" },
  { name: "zeigtHoehenmeter", formKey: "zeigt_hoehenmeter", label: "Gesammelte Höhenmeter zeigen" },
  { name: "zeigtDistanz", formKey: "zeigt_distanz", label: "GPS-getrackte Gesamtdistanz zeigen" },
  {
    name: "zeigtFollowerListe",
    formKey: "zeigt_follower_liste",
    label: "Follower-/Gefolgt-Liste zeigen",
    description: "Die Anzahl bleibt für andere immer sichtbar, unabhängig von dieser Einstellung.",
  },
];

// Kachel-Liste mit iOS-artigen Switches (components/ui/Switch.tsx) statt
// einer losen Spalte nativer Checkboxen — gleiches Card+divide-y-Muster wie
// andere Listen der App (z. B. Streckenvorschläge im selben Einstellungen-
// Bereich). Jeder Switch bleibt technisch eine unkontrollierte Checkbox
// (name/value/defaultChecked), submitted also weiterhin gesammelt über den
// einen "Speichern"-Button unten statt pro Zeile automatisch zu sichern.
export default function VisibilitySettings({ privatzoneRadiusM, ...flags }: VisibilitySettingsProps) {
  const [state, formAction, pending] = useActionState(updateVisibilitySettings, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Card className="flex flex-col divide-y divide-border px-4">
        {FIELDS.map((field) => (
          <Switch
            key={field.formKey}
            name={field.formKey}
            value="true"
            defaultChecked={flags[field.name]}
            label={field.label}
            description={field.description}
          />
        ))}
      </Card>

      {/* Privatzone: kein Schalter, sondern eine Auswahl — und bewusst
          nicht in der Schalterliste oben, weil sie etwas anderes tut. Die
          übrigen Einstellungen entscheiden, ob eine Zahl sichtbar ist; diese
          entscheidet, wie viel einer geteilten Fahrt am Anfang und Ende
          abgeschnitten wird, bevor sie überhaupt jemand sieht. */}
      <Card className="flex flex-col gap-2 p-4">
        <label htmlFor="privatzone" className="text-sm font-medium">
          Privatzone auf geteilten Karten
        </label>
        <select
          id="privatzone"
          name="privatzone_radius_m"
          defaultValue={String(privatzoneRadiusM)}
          className={fieldClassName()}
        >
          {PRIVACY_RADIUS_OPTIONS.map((radius) => (
            <option key={radius} value={radius}>
              {PRIVACY_RADIUS_LABELS[radius]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          Der Anfang und das Ende jeder geteilten Fahrt werden in diesem Umkreis von der
          öffentlichen Karte entfernt — sonst beginnt und endet die Spur vor deiner Haustür. Eine
          Änderung gilt auch für deine bereits geteilten Fahrten. Deine eigene Ansicht bleibt
          vollständig.
        </p>
      </Card>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {!state.error && state.success && !pending && (
        <p role="status" className="text-sm text-success">
          Gespeichert.
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Speichern…" : "Einstellungen speichern"}
      </Button>
    </form>
  );
}
