import { expect, test, type Page } from "@playwright/test";

// Wo anmelden.setup.ts die Sitzung ablegt. Liegt unter e2e/.auth/, das per
// .gitignore nie ins Repository kommt — die Datei enthält gültige
// Sitzungs-Cookies.
export const SITZUNG = "e2e/.auth/staging.json";

export const hatZugangsdaten = () =>
  Boolean(process.env.STAGING_E2E_EMAIL && process.env.STAGING_E2E_PASSWORD);

// Für Tests, die eine Moderator-Sitzung brauchen. Lokal ohne Zugangsdaten
// werden sie übersprungen statt rot; in der CI bricht schon anmelden.setup.ts
// ab, damit ein fehlendes Secret nicht als grüner Lauf durchgeht.
export function brauchtAnmeldung() {
  test.skip(
    !hatZugangsdaten(),
    "STAGING_E2E_EMAIL / STAGING_E2E_PASSWORD fehlen — siehe e2e/README.md",
  );
}

// Was jede Seite erfüllen muss, egal welche:
//
// - Das Staging-Gate hat nicht zugeschlagen (403-Text) und die Anmeldung
//   nicht verloren (Weiterleitung auf /anmelden).
// - Keine Fehlergrenze. Der HTTP-Status allein reicht nicht: eine kaputte
//   Seite antwortet mit 200 und zeigt "Etwas ist schiefgelaufen." — genau so
//   ging /leaderboards am 2026-09-13 in Produktion (scripts/smoke-render.mjs).
// - Kein unbehandelter JavaScript-Fehler im Browser.
// - Kein horizontales Scrollen. Auf dem Telefon der häufigste Layoutfehler:
//   ein zu breites Element schiebt die ganze Seite seitlich.
export async function oeffneSeite(page: Page, pfad: string) {
  const fehler: string[] = [];
  page.on("pageerror", (e) => fehler.push(e.message));

  const antwort = await page.goto(pfad, { waitUntil: "domcontentloaded" });
  expect(antwort?.status(), `HTTP-Status von ${pfad}`).toBeLessThan(400);
  await page.waitForLoadState("load");

  await expect(page, `${pfad} hat auf die Anmeldung umgeleitet`).not.toHaveURL(/\/anmelden/);
  await expect(page.getByText("Diese Staging-Umgebung ist auf Moderatoren beschränkt.")).toHaveCount(0);
  await expect(page.getByText("Etwas ist schiefgelaufen.")).toHaveCount(0);

  await pruefeKeinSeitlichesScrollen(page, pfad);

  return {
    pruefeKeineFehler: () => expect(fehler, `JavaScript-Fehler auf ${pfad}`).toEqual([]),
  };
}

export async function pruefeKeinSeitlichesScrollen(page: Page, pfad: string) {
  const { breite, sichtbar, taeter } = await page.evaluate(() => {
    const sichtbar = window.innerWidth;
    // Das breiteste Element, das über den rechten Rand ragt — damit die
    // Fehlermeldung sagt, wo man suchen muss, statt nur "zu breit".
    let taeter = "";
    let weitester = sichtbar;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > weitester + 1) {
        weitester = r.right;
        taeter = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).slice(0, 80)}`;
      }
    }
    return { breite: document.documentElement.scrollWidth, sichtbar, taeter };
  });
  expect(
    breite,
    `${pfad} scrollt seitlich (${breite} px Inhalt bei ${sichtbar} px Bildschirm) — breitestes Element: ${taeter}`,
  ).toBeLessThanOrEqual(sichtbar + 1);
}

// Eine echte, freigegebene Strecke für die Detailseite. Über die öffentliche
// API (vom Staging-Gate ausgenommen, siehe proxy.ts) statt einer fest
// eingetragenen ID: eine Strecke kann abgelehnt oder gelöscht werden, die
// Liste nicht.
export async function ersteStrecke(page: Page): Promise<{ id: string; name: string }> {
  const antwort = await page.request.get("/api/strecken");
  expect(antwort.ok(), "GET /api/strecken").toBeTruthy();
  const { routes: data } = (await antwort.json()) as { routes: { id: string; name: string }[] };
  expect(data.length, "keine freigegebene Strecke gefunden").toBeGreaterThan(0);
  return data[0];
}
