import { expect, test } from "@playwright/test";
import { brauchtAnmeldung, ersteStrecke, oeffneSeite } from "./hilfen";

// Angemeldet als Moderator, nur lesend: jede Seite wird geöffnet und auf
// ihren Kern geprüft, nichts wird angeklickt, das schreibt. Staging hängt an
// der Produktions-DB — siehe playwright.config.ts.
test.beforeEach(() => brauchtAnmeldung());

// karte: Seiten mit Mapbox. Dort wird auf JavaScript-Fehler nicht geprüft —
// ein Headless-Browser ohne GPU kann WebGL ablehnen, und das wäre ein Fehler
// der Testumgebung, nicht der App.
const SEITEN = [
  { pfad: "/", titel: null, karte: true },
  { pfad: "/feed", titel: null, karte: false },
  { pfad: "/ranglisten", titel: null, karte: false },
  { pfad: "/paesse", titel: "Pässe der Schweiz", karte: false },
  { pfad: "/premium", titel: "Mehr aus jeder Saison", karte: false },
  { pfad: "/profil", titel: null, karte: false },
  { pfad: "/aktivitaet", titel: null, karte: false },
  { pfad: "/moderation", titel: "Moderation", karte: false },
];

for (const { pfad, titel, karte } of SEITEN) {
  test(`${pfad} lädt ohne Fehler`, async ({ page }) => {
    const seite = await oeffneSeite(page, pfad);
    if (titel) {
      await expect(page.getByRole("heading", { level: 1, name: titel })).toBeVisible();
    } else {
      // Jede Seite trägt genau einen Seitentitel. Auf der Startseite sitzt er
      // im Sheet und kann auf dem Telefon eingeklappt sein — daher nur
      // "vorhanden", nicht "sichtbar".
      await expect(page.locator("h1").first()).toBeAttached();
    }
    if (!karte) seite.pruefeKeineFehler();
  });
}

test("Streckendetail zeigt die Strecke", async ({ page }) => {
  const strecke = await ersteStrecke(page);
  await oeffneSeite(page, `/strecken/${strecke.id}`);
  await expect(page.getByRole("heading", { level: 1, name: strecke.name })).toBeVisible();
});

test("Premium nennt Preise in CHF", async ({ page }) => {
  await oeffneSeite(page, "/premium");
  await expect(page.getByText(/CHF\s*\d/).first()).toBeVisible();
});
