import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { SITZUNG } from "./e2e/hilfen";

// End-to-End-Tests gegen die laufende Staging-Umgebung (staging.strado.ch).
//
// Staging spricht gegen die PRODUKTIONS-Datenbank (siehe "Release Flow" in
// AGENTS.md). Deshalb lesen die Tests hier ausschliesslich: sie öffnen
// Seiten und prüfen, was dort steht, klicken aber nichts an, das schreibt.
// Wer einen schreibenden Test ergänzt, muss darin selbst aufräumen — siehe
// e2e/README.md.
//
// Zugangsdaten kommen aus STAGING_E2E_EMAIL / STAGING_E2E_PASSWORD
// (.env.local lokal, GitHub-Secrets in der CI), nie aus dem Repository.
loadEnvConfig(process.cwd());

const BASIS_URL = process.env.STAGING_E2E_URL ?? "https://staging.strado.ch";

// Mobile first: die kleinsten Telefone zuerst, Desktop zuletzt. Strado wird
// unterwegs benutzt, und die meisten Layoutfehler zeigen sich bei 320 px,
// nicht bei 1280. WebKit für die Apple-Geräte, Chromium für Android und
// Desktop — so läuft jede Seite auch durch die Engine, die iOS-Safari
// tatsächlich antreibt.
//
// Emulation ist kein Telefon: Sticky-Hover, Tap-Verzögerung, Safe Areas und
// die Bildschirmtastatur sieht nur echte Hardware (e2e/README.md).
const GERAETE = [
  { name: "iphone-se", geraet: devices["iPhone SE"] }, // 320 × 568
  { name: "galaxy-s8", geraet: devices["Galaxy S8"] }, // 360 × 740
  { name: "iphone-15", geraet: devices["iPhone 15"] }, // 393 × 659
  { name: "pixel-7", geraet: devices["Pixel 7"] }, // 412 × 839
  { name: "ipad-mini", geraet: devices["iPad Mini"] }, // 768 × 1024
  { name: "desktop", geraet: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
];

export default defineConfig({
  testDir: "e2e",
  // *.e2e.ts statt *.spec.ts: Vitests include-Glob (vitest.config.mts)
  // greift jede *.spec.ts auf und würde diese Dateien sonst mitlaufen lassen.
  testMatch: /.*\.e2e\.ts/,
  outputDir: "e2e/.ergebnisse",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Staging ist ein einzelnes Deployment gegen die Produktions-DB — nicht
  // mit sechs Geräten × acht Seiten gleichzeitig darauf einschlagen.
  workers: process.env.CI ? 3 : 4,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "e2e/.bericht" }]]
    : [["list"], ["html", { open: "never", outputFolder: "e2e/.bericht" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASIS_URL,
    locale: "de-CH",
    timezoneId: "Europe/Zurich",
    // Ein Trace zeichnet die Netzwerk-Header mit auf, also auch das
    // Sitzungs-Cookie des Moderator-Kontos. In der CI landet der Bericht als
    // Artefakt im Repository — dort deshalb kein Trace, nur Screenshots.
    trace: process.env.CI ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Meldet sich einmal pro Lauf an und legt die Sitzung ab; alle Geräte
    // starten danach bereits eingeloggt.
    { name: "anmelden", testMatch: /anmelden\.setup\.ts/, use: devices["Desktop Chrome"] },
    ...GERAETE.map(({ name, geraet }) => ({
      name,
      use: { ...geraet, storageState: SITZUNG },
      dependencies: ["anmelden"],
    })),
  ],
});
