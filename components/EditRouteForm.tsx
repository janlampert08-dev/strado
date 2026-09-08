"use client";

import { useActionState, useState } from "react";
import { KATEGORIEN } from "@/lib/constants";
import type { UpdateRouteState } from "@/lib/actions/routes";
import type { RouteGeoJSON } from "@/types/database";
import { Input, Textarea } from "@/components/ui/Input";
import Button from "@/components/ui/Button";

const initialState: UpdateRouteState = { error: null };

type UpdateAction = (
  routeId: string,
  prevState: UpdateRouteState,
  formData: FormData,
) => Promise<UpdateRouteState>;

export default function EditRouteForm({
  route,
  action,
  adminMode = false,
}: {
  route: RouteGeoJSON;
  action: UpdateAction;
  adminMode?: boolean;
}) {
  const boundAction = action.bind(null, route.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [startOrt, setStartOrt] = useState(route.start_ort);

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-10">
      <div>
        <h1 className="text-display font-semibold">
          {adminMode ? "Strecke bearbeiten (Moderation)" : "Strecke bearbeiten"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {adminMode
            ? "Der Streckenverlauf selbst kann hier nicht geändert werden. Änderungen sind sofort für alle sichtbar."
            : "Der Streckenverlauf selbst kann hier nicht geändert werden — bei Problemen mit der Route lieber neu erstellen. Nach dem Speichern geht die Strecke erneut zur Prüfung."}
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name
        <Input name="name" required defaultValue={route.name} />
      </label>

      {adminMode && (
        <p className="-mt-2 text-xs text-muted">
          Region, Start- und Ziel-Ort wurden beim Erstellen automatisch aus der Karte ermittelt —
          bei Bedarf hier korrigieren.
        </p>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Region
        <Input name="region" required defaultValue={route.region} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Start-Ort
          <Input
            name="start_ort"
            required
            value={startOrt}
            onChange={(e) => setStartOrt(e.target.value)}
          />
        </label>
        {route.ist_rundfahrt ? (
          <input type="hidden" name="ziel_ort" value={startOrt} />
        ) : (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Ziel-Ort
            <Input name="ziel_ort" required defaultValue={route.ziel_ort} />
          </label>
        )}
      </div>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 text-muted">Kategorien</legend>
        {KATEGORIEN.map((k) => (
          <label key={k.value} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="kategorien"
              value={k.value}
              defaultChecked={route.kategorien.includes(k.value)}
              className="h-4 w-4 accent-accent"
            />
            {k.label}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Charakter (optional)
        <Textarea name="charakter_text" rows={3} defaultValue={route.charakter_text ?? ""} />
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Speichern…" : "Speichern"}
      </Button>
    </form>
  );
}
