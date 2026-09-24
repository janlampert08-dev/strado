import { expect, test } from "@playwright/test";
import { pruefeKeinSeitlichesScrollen } from "./hilfen";

// Ohne Anmeldung. Diese Tests laufen immer, auch lokal ohne Zugangsdaten —
// und sie prüfen die einzige Schranke vor Staging: Vercels Deployment
// Protection ist dort aus (Stripe-Webhooks), also steht nur proxy.ts
// zwischen dem Internet und einer App gegen die Produktions-DB.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Staging-Gate", () => {
  for (const pfad of ["/", "/paesse", "/moderation"]) {
    test(`${pfad} leitet ohne Anmeldung auf /anmelden um`, async ({ page }) => {
      await page.goto(pfad);
      await expect(page).toHaveURL(/\/anmelden\?next=/);
      await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    });
  }

  test("robots.txt sperrt die Indexierung", async ({ request }) => {
    const antwort = await request.get("/robots.txt");
    expect(antwort.ok()).toBeTruthy();
    expect(await antwort.text()).toMatch(/Disallow:\s*\/\s*$/m);
  });
});

// Die Anmeldeseite ist die einzige Seite mit Formular, die ohne Konto
// erreichbar ist — hier lassen sich die Mobil-Regeln für Eingabefelder
// prüfen, ohne etwas zu schreiben.
test.describe("Anmeldeseite auf dem Telefon", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/anmelden");
  });

  test("passt in die Bildschirmbreite", async ({ page }) => {
    await pruefeKeinSeitlichesScrollen(page, "/anmelden");
  });

  // iOS-Safari zoomt in jedes Feld unter 16 px und zoomt danach nicht
  // zurück. Die Abhilfe ist die Schriftgrösse, nie maximum-scale=1.
  // Gilt für jedes Touch-Gerät, auch das iPad — nicht nur unter md.
  test("Eingabefelder haben mindestens 16 px Schrift", async ({ page, hasTouch }) => {
    test.skip(!hasTouch, "Am Desktop zoomt kein Browser in ein Feld");
    for (const feld of [page.getByLabel("E-Mail"), page.getByLabel("Passwort", { exact: true })]) {
      const groesse = await feld.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(groesse, "Schriftgrösse eines Eingabefelds").toBeGreaterThanOrEqual(16);
    }
  });

  test("E-Mail-Feld ruft die passende Tastatur auf", async ({ page }) => {
    const email = page.getByLabel("E-Mail");
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("autocapitalize", "none");
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(page.getByLabel("Passwort", { exact: true })).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  test("Anmelden-Knopf ist gross genug zum Tippen", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Tippflächen zählen nur auf Touch-Geräten");
    const box = await page.getByRole("button", { name: "Anmelden" }).boundingBox();
    expect(box?.height ?? 0, "Höhe der Tippfläche").toBeGreaterThanOrEqual(44);
  });
});

// Die Plattform-Grundlage aus dem Kopf jeder Seite (app/layout.tsx →
// viewport). Einmal hier geprüft, weil sie auf allen Seiten dieselbe ist.
test.describe("Viewport und Browser-Chrome", () => {
  test("Zoomen bleibt erlaubt, Inhalt reicht bis unter die Notch", async ({ page }) => {
    await page.goto("/anmelden");
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("viewport-fit=cover");
    // Zoom sperren ist ein Barrierefreiheitsfehler, keine Lösung.
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/);
    expect(viewport).not.toMatch(/maximum-scale\s*=\s*1(\.0)?(\s|,|$)/);
  });

  test("Statusleiste hat je Farbschema eine eigene Farbe", async ({ page }) => {
    await page.goto("/anmelden");
    const medien = await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("media")));
    expect(medien).toEqual(
      expect.arrayContaining(["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"]),
    );
  });

  test("kein grauer Blitz beim Tippen", async ({ page, browserName }) => {
    // WebKit liefert die Eigenschaft über getComputedStyle nicht aus (leerer
    // String), obwohl es sie anwendet — prüfbar nur in Chromium.
    test.skip(browserName !== "chromium", "WebKit meldet den Wert nicht");
    await page.goto("/anmelden");
    const farbe = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("-webkit-tap-highlight-color"),
    );
    expect(farbe.trim()).toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
  });

  // Das globale Stylesheet ist auf jeder Seite dasselbe, darum genügt die
  // Anmeldeseite, die ohne Konto erreichbar ist.
  test("Hover-Stile hängen nicht auf Touch-Geräten", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Nur Touch-Geräte haben das Problem");
    await page.goto("/anmelden");
    // Tailwind v4 legt hover: hinter @media (hover: hover). Ein ungeschützter
    // :hover-Stil bleibt auf dem Telefon nach dem Tippen stehen.
    const ungeschuetzt = await page.evaluate(() => {
      const funde: string[] = [];
      const durchsuche = (regeln: CSSRuleList, geschuetzt: boolean) => {
        for (const regel of Array.from(regeln)) {
          if (regel instanceof CSSMediaRule) {
            durchsuche(regel.cssRules, geschuetzt || /hover:\s*hover/.test(regel.conditionText));
          } else if (regel instanceof CSSStyleRule && !geschuetzt && /:hover\b/.test(regel.selectorText)) {
            funde.push(regel.selectorText);
          } else if ("cssRules" in regel && (regel as CSSGroupingRule).cssRules) {
            durchsuche((regel as CSSGroupingRule).cssRules, geschuetzt);
          }
        }
      };
      for (const blatt of Array.from(document.styleSheets)) {
        try {
          durchsuche(blatt.cssRules, false);
        } catch {
          // Fremde Stylesheets (Mapbox) sind nicht lesbar — nicht unsere Regeln.
        }
      }
      return funde;
    });
    expect(ungeschuetzt, "ungeschützte :hover-Regeln").toEqual([]);
  });
});
