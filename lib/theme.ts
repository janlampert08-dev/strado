// Zentrale Konstante für den Custom-Event-Namen, den ThemeToggle.tsx bei
// jedem manuellen Wechsel feuert (localStorage-Schreibvorgänge lösen im
// selben Tab kein "storage"-Event aus) — von hier importierbar für alle
// Stellen, die live auf einen Themenwechsel reagieren müssen (z.B. der
// Kartenstil in RouteMap.tsx/RoutePicker.tsx).
export const THEME_CHANGE_EVENT = "cornice-theme-change";

// Liest das aktuell wirksame Farbschema: eine explizite Wahl (data-theme,
// siehe ThemeToggle.tsx) gewinnt, sonst die System-Einstellung.
export function isDarkTheme(): boolean {
  const explicit = document.documentElement.dataset.theme;
  return explicit === "dark" || (!explicit && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

// Ruft callback bei jedem Themenwechsel auf: manueller Toggle
// (THEME_CHANGE_EVENT), ein Wechsel in einem anderen Browser-Tab (storage)
// und — sofern "System" aktiv ist — eine geänderte Betriebssystem-
// Einstellung (matchMedia).
export function subscribeToThemeChange(callback: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
    media.removeEventListener("change", callback);
  };
}

// Ein Design-Token als aufgelöster Farbwert, für Zeichenflächen, die keine
// CSS-Variablen verstehen: Mapbox-Layer (components/RouteMap.tsx,
// RoutePicker.tsx) nehmen nur fertige Farben entgegen, und ein
// "var(--color-accent)" landet dort als ungültiger Wert.
//
// Warum das überhaupt nötig wurde: die Karte tauschte ihren Stil bei einem
// Themenwechsel längst korrekt aus (mapStyleForTheme), aber die LINIEN
// darauf standen als feste Hex-Werte im Code — TRACK_COLOR und der
// Live-Positionspunkt beide auf "#3D5AFE", also dem Akzentwert des HELLEN
// Themes. Im Dunkelmodus wurde die Karte dunkel und die aufgezeichnete
// Spur blieb im Tagblau stehen, während --color-accent längst auf #6b83ff
// gewechselt hatte. Genau der Fall, für den der Dunkelmodus da ist: die
// Aufzeichnung bei Nacht.
//
// Serverseitig (kein document) und bei leerem Ergebnis greift der
// Rückfallwert — sonst bekäme ein Layer einen leeren String.
export function tokenFarbe(name: string, rueckfall: string): string {
  if (typeof document === "undefined") return rueckfall;
  const wert = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return wert === "" ? rueckfall : wert;
}

/** --color-accent, aufgelöst. Rückfallwert ist der helle Themenwert. */
export function akzentFarbe(): string {
  return tokenFarbe("--color-accent", "#3d5afe");
}
