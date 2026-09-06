"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { countActiveFilters, EMPTY_ADVANCED_FILTERS, type AdvancedFilters } from "@/lib/exploreFilters";
import { fieldClassName } from "@/components/ui/Input";

function toNullableNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// Zurzeit von keiner Seite eingebunden: die Startseite zeigt seit der
// Verschlankung der Explore-Ansicht nur noch Suchtext und Standort
// (components/ExploreView.tsx). Bewusst als Modul behalten statt gelöscht —
// km-/Höhen-/Saison-Filter lohnen sich wieder, sobald der kuratierte
// Streckenbestand gross genug ist, um ihn eingrenzen zu müssen; bis dahin
// halten die Tests in lib/exploreFilters.test.ts die Logik lauffähig.
//
// Natives <details> statt eigenem useState fürs Auf-/Zuklappen — der Browser
// übernimmt Zustand und Tastatursteuerung, die Filterwerte selbst müssen
// trotzdem kontrolliert sein, da sie beim Einhängen in eine Streckenliste
// einfliessen.
export default function AdvancedFiltersPanel({
  filters,
  onChange,
}: {
  filters: AdvancedFilters;
  onChange: (filters: AdvancedFilters) => void;
}) {
  const activeCount = countActiveFilters(filters);

  return (
    <details className="group border-b border-border pb-6">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-4 w-4 text-muted" aria-hidden="true" />
          Weitere Filter
          {activeCount > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-background">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted transition-transform duration-fast group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Distanz von (km)
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={filters.minKm ?? ""}
              onChange={(e) => onChange({ ...filters, minKm: toNullableNumber(e.target.value) })}
              className={fieldClassName()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Distanz bis (km)
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={filters.maxKm ?? ""}
              onChange={(e) => onChange({ ...filters, maxKm: toNullableNumber(e.target.value) })}
              className={fieldClassName()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Höhenmeter von
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={filters.minHoehe ?? ""}
              onChange={(e) => onChange({ ...filters, minHoehe: toNullableNumber(e.target.value) })}
              className={fieldClassName()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Höhenmeter bis
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={filters.maxHoehe ?? ""}
              onChange={(e) => onChange({ ...filters, maxHoehe: toNullableNumber(e.target.value) })}
              className={fieldClassName()}
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={filters.nurGanzjaehrig}
            onChange={(e) => onChange({ ...filters, nurGanzjaehrig: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          Nur ganzjährig befahrbar
        </label>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_ADVANCED_FILTERS)}
            className="self-start text-sm font-medium text-accent hover:underline"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>
    </details>
  );
}
