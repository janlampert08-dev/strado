// Filterzustand der Explore-Ansicht. Zurzeit nur noch von
// components/AdvancedFiltersPanel.tsx genutzt, das selbst geparkt ist: die
// Startseite filtert seit der Verschlankung nur noch über den Suchtext
// (components/ExploreView.tsx, das ?q= direkt liest und schreibt). Modul und
// Tests bleiben bestehen, damit die Filter wieder eingehängt werden können,
// ohne sie neu zu schreiben.
import { KATEGORIEN } from "@/lib/constants";
import type { ExploreRoute, Kategorie } from "@/types/database";

export interface AdvancedFilters {
  minKm: number | null;
  maxKm: number | null;
  minHoehe: number | null;
  maxHoehe: number | null;
  nurGanzjaehrig: boolean;
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  minKm: null,
  maxKm: null,
  minHoehe: null,
  maxHoehe: null,
  nurGanzjaehrig: false,
};

export function countActiveFilters(f: AdvancedFilters): number {
  return (
    Number(f.minKm !== null) +
    Number(f.maxKm !== null) +
    Number(f.minHoehe !== null) +
    Number(f.maxHoehe !== null) +
    Number(f.nurGanzjaehrig)
  );
}

// Alle Filter UND-verknüpft — jeder engt eine andere Eigenschaft ein, im
// Gegensatz zur ODER-Verknüpfung der Kategorie-Chips (lib/search.ts bzw.
// ExploreView.tsx), die dieselbe Eigenschaft (Kategorie) mehrfach abdecken.
export function applyAdvancedFilters<T extends ExploreRoute>(routes: T[], f: AdvancedFilters): T[] {
  let filtered = routes;
  if (f.minKm !== null) filtered = filtered.filter((r) => r.laenge_km >= f.minKm!);
  if (f.maxKm !== null) filtered = filtered.filter((r) => r.laenge_km <= f.maxKm!);
  if (f.minHoehe !== null) filtered = filtered.filter((r) => (r.hoehe_m ?? 0) >= f.minHoehe!);
  if (f.maxHoehe !== null) filtered = filtered.filter((r) => (r.hoehe_m ?? 0) <= f.maxHoehe!);
  if (f.nurGanzjaehrig) filtered = filtered.filter((r) => r.saison_status === "ganzjaehrig");
  return filtered;
}

// Bündelt den gesamten Explore-Filterzustand (Suchtext, Kategorie-Chips,
// erweiterte Filter), damit er als eine Einheit zwischen URL-Query-String
// und React-State hin- und herübersetzt werden kann (siehe ExploreView.tsx).
export interface ExploreFiltersState {
  searchQuery: string;
  selectedKategorien: Kategorie[];
  advancedFilters: AdvancedFilters;
}

export const EMPTY_EXPLORE_FILTERS_STATE: ExploreFiltersState = {
  searchQuery: "",
  selectedKategorien: [],
  advancedFilters: EMPTY_ADVANCED_FILTERS,
};

const VALID_KATEGORIEN: readonly Kategorie[] = KATEGORIEN.map((k) => k.value);

function isKategorie(value: string): value is Kategorie {
  return (VALID_KATEGORIEN as readonly string[]).includes(value);
}

function parseNullableNumberParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// Liest den Explore-Filterzustand aus einem URLSearchParams (bzw. dem
// strukturell kompatiblen ReadonlyURLSearchParams von useSearchParams()).
// Unbekannte/fehlerhafte Werte (ungültige Kategorie, nicht-numerisches
// minKm etc.) werden stillschweigend ignoriert statt zu werfen — eine von
// Hand editierte oder veraltete URL soll nie zu einem Absturz führen,
// sondern höchstens zu "kein Filter aktiv".
export function parseExploreSearchParams(params: URLSearchParams): ExploreFiltersState {
  const searchQuery = params.get("q") ?? "";

  const katParam = params.get("kat");
  const selectedKategorien = katParam
    ? Array.from(new Set(katParam.split(",").filter(isKategorie)))
    : [];

  return {
    searchQuery,
    selectedKategorien,
    advancedFilters: {
      minKm: parseNullableNumberParam(params.get("minKm")),
      maxKm: parseNullableNumberParam(params.get("maxKm")),
      minHoehe: parseNullableNumberParam(params.get("minHoehe")),
      maxHoehe: parseNullableNumberParam(params.get("maxHoehe")),
      nurGanzjaehrig: params.get("ganzjaehrig") === "1",
    },
  };
}

// Kehrt parseExploreSearchParams() um: leere/leerlaufende Werte (Suchtext
// "", keine Kategorien, EMPTY_ADVANCED_FILTERS-Felder) werden bewusst
// weggelassen statt als leerer Parameter geschrieben — eine zurückgesetzte
// Explore-Seite soll wieder eine saubere URL ohne Query-String ergeben.
export function serializeExploreSearchParams(state: ExploreFiltersState): URLSearchParams {
  const params = new URLSearchParams();

  const trimmedQuery = state.searchQuery.trim();
  if (trimmedQuery !== "") params.set("q", trimmedQuery);

  if (state.selectedKategorien.length > 0) {
    params.set("kat", state.selectedKategorien.join(","));
  }

  const { minKm, maxKm, minHoehe, maxHoehe, nurGanzjaehrig } = state.advancedFilters;
  if (minKm !== null) params.set("minKm", String(minKm));
  if (maxKm !== null) params.set("maxKm", String(maxKm));
  if (minHoehe !== null) params.set("minHoehe", String(minHoehe));
  if (maxHoehe !== null) params.set("maxHoehe", String(maxHoehe));
  if (nurGanzjaehrig) params.set("ganzjaehrig", "1");

  return params;
}
