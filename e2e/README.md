# E2E-Tests gegen Staging

Playwright öffnet `staging.strado.ch` auf sechs Geräten, das kleinste
zuerst, und prüft jede wichtige Seite:

| Projekt | Gerät | Breite | Engine |
| --- | --- | --- | --- |
| `iphone-se` | iPhone SE | 320 px | WebKit |
| `galaxy-s8` | Galaxy S8 | 360 px | Chromium |
| `iphone-15` | iPhone 15 | 393 px | WebKit |
| `pixel-7` | Pixel 7 | 412 px | Chromium |
| `ipad-mini` | iPad Mini | 768 px | WebKit |
| `desktop` | Desktop | 1440 px | Chromium |

## Lokal ausführen

1. In `.env.local` (nie committen) ein **Moderator-Konto** eintragen:

   ```
   STAGING_E2E_EMAIL=…
   STAGING_E2E_PASSWORD=…
   ```

   Ohne diese beiden laufen nur die Tests ohne Anmeldung
   (`zugang.e2e.ts`), der Rest wird übersprungen.

2. Einmalig die Browser holen: `npx playwright install chromium webkit`
3. `npm run test:e2e`, oder nur ein Gerät:
   `npx playwright test --project=iphone-se`
4. Bericht mit Screenshots: `npx playwright show-report e2e/.bericht`

`STAGING_E2E_URL` zeigt die Tests auf eine andere Adresse, etwa ein
einzelnes Vercel-Deployment desselben Branches.

## In der CI

`.github/workflows/staging-e2e.yml` läuft nach jedem erfolgreichen
Deployment von `staging`, jeden Morgen um 04:30 UTC und von Hand. Es braucht
die Repository-Secrets `STAGING_E2E_EMAIL` und `STAGING_E2E_PASSWORD`; fehlen
sie, schlägt der Lauf fehl, statt grün alles zu überspringen.

## Was geprüft wird

- **`zugang.e2e.ts`** (ohne Konto): das Staging-Gate leitet um, `robots.txt`
  sperrt, und die Grundlage für Mobilgeräte stimmt: Zoomen erlaubt,
  `viewport-fit=cover`, `theme-color` je Farbschema, kein Tipp-Blitz, kein
  ungeschütztes `:hover`, Felder mit mindestens 16 px auf Touch-Geräten.
- **`seiten.e2e.ts`**: jede Hauptseite lädt ohne Fehlergrenze, ohne
  JavaScript-Fehler und ohne seitliches Scrollen, dazu eine echte Strecke
  und die Premium-Preise.
- **`mobil.e2e.ts`**: die untere Navigation erscheint nur unter 768 px, ihre
  Reiter sind mindestens 44 × 44 px gross und sie liegt vollständig im
  sichtbaren Bereich.

## Regeln

- **Nur lesen.** Staging hängt an der Produktions-DB. Ein Test, der
  schreibt (Fahrt, Fahrzeug, Bewertung), erzeugt echte Daten. Wer einen
  solchen Test ergänzt, markiert alles Erzeugte eindeutig (etwa ein Titel
  mit `e2e-`) und löscht es im selben Test in einem `finally`/`afterEach`
  wieder, auch wenn der Test fehlschlägt.
- **Keine Zugangsdaten im Repository.** `e2e/.auth/` enthält eine gültige
  Sitzung und ist in `.gitignore`.
- **Emulation ist kein Telefon.** Sticky-Hover, Tipp-Verzögerung,
  Safe Areas, das Zurückfedern beim Scrollen und die Bildschirmtastatur
  zeigen sich nur auf echter Hardware. Grün heisst hier „Layout und Markup
  stimmen", nicht „fühlt sich auf dem iPhone richtig an".
