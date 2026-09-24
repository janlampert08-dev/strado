import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test as setup } from "@playwright/test";
import { SITZUNG, hatZugangsdaten } from "./hilfen";

// Meldet sich einmal pro Lauf über das echte Formular an und legt die
// Sitzung (Supabase-Cookies) in SITZUNG ab. Jedes Gerät startet danach mit
// dieser Datei als storageState, also bereits eingeloggt.
//
// Über das Formular statt über die Supabase-API: das prüft die Anmeldung
// gleich mit, und die Cookies entstehen genau so, wie @supabase/ssr sie
// schreibt — ein nachgebautes Cookie-Format bräche beim nächsten Update.
//
// Das Konto muss Moderator sein (profiles.is_moderator), sonst sperrt
// proxy.ts jede Seite mit 403.
setup("anmelden", async ({ page }) => {
  mkdirSync(dirname(SITZUNG), { recursive: true });

  if (!hatZugangsdaten()) {
    // In der CI ein Fehler: ein fehlendes Secret darf nicht als grüner Lauf
    // enden, in dem alles übersprungen wurde.
    if (process.env.CI) {
      throw new Error("STAGING_E2E_EMAIL / STAGING_E2E_PASSWORD sind als Secrets nicht gesetzt.");
    }
    // Lokal: leere Sitzung ablegen, damit die Geräte-Projekte starten und
    // wenigstens die Tests ohne Anmeldung laufen (e2e/zugang.e2e.ts).
    writeFileSync(SITZUNG, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, "Keine Zugangsdaten — nur Tests ohne Anmeldung laufen.");
    return;
  }

  await page.goto("/anmelden?next=/profil");
  await page.getByLabel("E-Mail").fill(process.env.STAGING_E2E_EMAIL!);
  await page.getByLabel("Passwort", { exact: true }).fill(process.env.STAGING_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Anmelden" }).click();

  // signIn() leitet nach Erfolg auf next weiter. Bleibt die Seite auf
  // /anmelden, steht die Fehlermeldung im role="alert".
  await expect(page, "Anmeldung fehlgeschlagen — Zugangsdaten prüfen").toHaveURL(/\/profil/, {
    timeout: 20_000,
  });
  await expect(
    page.getByText("Diese Staging-Umgebung ist auf Moderatoren beschränkt."),
    "Angemeldet, aber das Konto ist kein Moderator (profiles.is_moderator)",
  ).toHaveCount(0);

  await page.context().storageState({ path: SITZUNG });
});
