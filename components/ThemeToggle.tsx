"use client";

import { useSyncExternalStore, type ComponentType } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_CHANGE_EVENT } from "@/lib/theme";
import { segmentClassName, segmentHuelleClassName } from "@/components/ui/SegmentedControl";

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "cornice-theme";

const OPTIONS: { value: ThemePreference; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
];

function readPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function readServerPreference(): ThemePreference {
  return "system";
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
}

function applyTheme(pref: ThemePreference) {
  if (pref === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = pref;
  }
}

// Manuelle Übersteuerung der prefers-color-scheme-Systemeinstellung (siehe
// app/globals.css: :root[data-theme] gewinnt in beide Richtungen gegen die
// @media-Abfrage). Das blockierende Inline-Script in app/layout.tsx setzt
// das data-theme-Attribut bereits vor dem ersten Paint aus localStorage —
// dieser Komponente bleibt nur, es interaktiv umzuschalten.
//
// useSyncExternalStore statt useState+useEffect: liest eine echte externe
// Quelle (localStorage) SSR-sicher — der Server-Snapshot ("system") wird
// für den ersten Client-Render übernommen, React korrigiert danach in
// einem eigenen, dafür vorgesehenen Mechanismus auf den echten Wert, ohne
// dass hier manuell setState im Effekt aufgerufen werden muss.
//
// Nur noch hier auf der Einstellungsseite (app/profil/einstellungen)
// eingebunden — die vorherige kompakte Pille im Header ist entfallen, die
// Farbschema-Wahl lebt jetzt ausschliesslich hier. Ohne manuelle Wahl gilt
// weiterhin "System" als Standard, unverändert.
//
// Der Kommentar hier behauptete bis zur Vereinheitlichung "gleiche
// Segmented-Control-Optik wie der Privat/Öffentlich-Umschalter" — und das
// stimmte nicht: dort rounded-lg und py-1.5, hier rounded-lg und py-2, und
// die Feed-Reiter waren wieder anders. Fünf Fassungen desselben
// Bedienelements. Jetzt teilen sich alle die Klassen aus
// ui/SegmentedControl.
//
// Die role="radiogroup"-Semantik hier war eine Zeitlang die einzige richtige:
// die zustandsbehaftete Variante in SegmentedControl kam mit role="group" und
// aria-pressed heraus, was einen gedrückten Knopf beschreibt statt einer Wahl
// aus mehreren. Seit der Review von PR #254 trägt sie dasselbe wie hier — die
// beiden Fassungen unterscheiden sich also nur noch darin, dass diese ihren
// Wert aus localStorage liest statt aus einer Prop.
export default function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, readPreference, readServerPreference);

  function choose(pref: ThemePreference) {
    if (pref === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, pref);
    }
    applyTheme(pref);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <div role="radiogroup" aria-label="Farbschema" className={segmentHuelleClassName("w-full")}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => choose(value)}
          className={segmentClassName(preference === value, "flex-1")}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
