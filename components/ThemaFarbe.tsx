"use client";

import { useEffect } from "react";
import { isDarkTheme, subscribeToThemeChange } from "@/lib/theme";

// Statusleiste und Browserleiste in der Farbe des WIRKLICH gewählten Schemas.
//
// app/layout.tsx setzt theme-color je prefers-color-scheme — das folgt dem
// System. Wer in den Einstellungen (ThemeToggle.tsx) gegen sein System
// "Dunkel" wählt, hatte deshalb eine helle Statusleiste über einer dunklen
// App: auf dem Telefon die Stelle, an der man zuerst sieht, dass es eine
// Webseite ist. Hier werden beide theme-color-Tags auf die Farbe des
// aktiven Schemas gesetzt, sobald es sich ändert. Ohne JavaScript bleibt
// es beim System-Verhalten aus dem Layout.
const FARBE = { hell: "#FAFAFA", dunkel: "#0B0B0D" } as const;

export default function ThemaFarbe() {
  useEffect(() => {
    function anwenden() {
      const farbe = isDarkTheme() ? FARBE.dunkel : FARBE.hell;
      document
        .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
        .forEach((meta) => meta.setAttribute("content", farbe));
    }
    anwenden();
    return subscribeToThemeChange(anwenden);
  }, []);
  return null;
}
