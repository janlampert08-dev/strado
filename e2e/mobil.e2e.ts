import { expect, test } from "@playwright/test";
import { brauchtAnmeldung } from "./hilfen";

// Was auf dem Telefon anders sein muss als am Desktop. Die Geräte kommen aus
// playwright.config.ts; jeder Test hier läuft auf allen sechs und
// entscheidet über viewport/isMobile, was er dort erwartet.
test.beforeEach(() => brauchtAnmeldung());

// components/BottomNav.tsx — fest am unteren Rand, ab md (768 px) aus.
const untereLeiste = "nav.fixed.bottom-0";

test("untere Navigation erscheint nur unterhalb von 768 px", async ({ page, viewport }) => {
  await page.goto("/feed");
  const leiste = page.locator(untereLeiste);
  if ((viewport?.width ?? 0) < 768) {
    await expect(leiste).toBeVisible();
    await expect(leiste.getByRole("link", { name: /Strecken/ })).toBeVisible();
    await expect(leiste.getByRole("link", { name: /Feed/ })).toHaveAttribute("aria-current", "page");
  } else {
    await expect(leiste).toBeHidden();
  }
});

test("Reiter der unteren Navigation sind gross genug zum Tippen", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 768, "Die Leiste gibt es nur auf dem Telefon");
  await page.goto("/feed");
  const reiter = page.locator(`${untereLeiste} a`);
  const anzahl = await reiter.count();
  expect(anzahl).toBeGreaterThan(0);
  for (let i = 0; i < anzahl; i++) {
    const box = await reiter.nth(i).boundingBox();
    const name = await reiter.nth(i).innerText();
    expect(box?.height ?? 0, `Höhe von „${name.trim()}"`).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, `Breite von „${name.trim()}"`).toBeGreaterThanOrEqual(44);
  }
});

test("untere Navigation liegt vollständig im sichtbaren Bereich", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) >= 768, "Die Leiste gibt es nur auf dem Telefon");
  await page.goto("/feed");
  const box = await page.locator(untereLeiste).boundingBox();
  // Eine Leiste mit 100vh-Rechnung rutscht unter die Browserleiste; sie muss
  // mit ihrer Unterkante genau am Rand des sichtbaren Bereichs abschliessen.
  expect(box, "Leiste nicht gefunden").not.toBeNull();
  expect(Math.round(box!.y + box!.height)).toBeLessThanOrEqual(viewport!.height);
});
