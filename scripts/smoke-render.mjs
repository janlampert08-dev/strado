#!/usr/bin/env node
// Ruft jede Seite der gebauten App einmal auf und schlaegt an, wenn beim
// Rendern etwas geworfen hat.
//
// Warum es diesen Schritt gibt: Am 2026-09-13 ist /leaderboards mit
// "Etwas ist schiefgelaufen" in Produktion gegangen, obwohl Lint, 570 Tests
// und der Build gruen waren. Die Seite reichte eine Funktion von einer
// Server- an eine Client-Komponente; React kann das nicht serialisieren.
// Keine der bestehenden Pruefungen konnte das sehen:
//
//   - `next build` rendert eine dynamische Seite (ƒ) nie, der Fehler
//     entsteht erst bei einer echten Anfrage.
//   - Vitest laeuft mit environment: "node", es gibt kein jsdom und damit
//     keine Komponententests (siehe AGENTS.md).
//   - Der HTTP-Status verraet nichts: die kaputte Seite antwortete mit
//     200. Next.js streamt die Huelle, der Fehler landet danach in der
//     Fehlergrenze. **Ein reiner Status-Check haette den Fehler durchgelassen.**
//
// Deshalb pruefen wir beides: Status UND die Server-Ausgabe. Next.js
// praefixt einen nicht abgefangenen Render-Fehler mit "⨯"; abgefangene
// Fehler (etwa die fetch-Fehler, die die Platzhalter-Zugangsdaten hier
// ausloesen) tragen das Zeichen nicht. Genau diese Trennung macht den
// Schritt brauchbar, statt ihn in Dauerrot laufen zu lassen.
//
// Der Lauf braucht keine echten Zugangsdaten: Der Serialisierungsfehler
// haengt am Rendern, nicht an den Daten.

import { spawn } from "node:child_process";
import { setTimeout as warte } from "node:timers/promises";

const PORT = process.env.SMOKE_PORT ?? "3999";
const BASIS = `http://127.0.0.1:${PORT}`;

// Jede Seite einmal. Dynamische Segmente ([id]) bleiben draussen — sie
// brauchen einen echten Datensatz, und dieser Schritt soll ohne Datenbank
// laufen. /c/<code> ist dabei, weil der Route Handler ohne Treffer still
// weiterleitet, also auch ohne Daten eine echte Antwort gibt.
const ROUTEN = [
  "/",
  "/feed",
  "/leaderboards",
  "/leaderboards?klasse=moto_a1",
  "/leaderboards?klasse=ungueltig",
  "/aktivitaet",
  "/strecken/neu",
  "/fahrten/neu",
  "/anmelden",
  "/registrieren",
  "/registrieren/bestaetigen",
  "/profil",
  "/profil/einstellungen",
  "/profil/einstellungen/abo",
  "/profil/fahrzeuge/neu",
  "/profil/passwort-aendern",
  "/profil/premium",
  "/profil/premium/zahlung",
  "/profil/premium/abschluss",
  "/moderation",
  "/moderation/creator",
  "/offline",
  "/c/smoke-test",
  "/api/strecken",
  "/sitemap.xml",
  "/robots.txt",
];

const server = spawn("npx", ["next", "start", "--port", PORT], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});

let ausgabe = "";
server.stdout.on("data", (d) => (ausgabe += d.toString()));
server.stderr.on("data", (d) => (ausgabe += d.toString()));

function beenden(code) {
  server.kill("SIGTERM");
  process.exit(code);
}

// Warten, bis der Server steht — hoechstens 60 s.
let bereit = false;
for (let i = 0; i < 120; i++) {
  if (/Ready in|ready started server/i.test(ausgabe)) {
    bereit = true;
    break;
  }
  if (server.exitCode !== null) break;
  await warte(500);
}
if (!bereit) {
  console.error("Server ist nicht gestartet. Ausgabe:\n" + ausgabe);
  beenden(1);
}

const fehler = [];
for (const route of ROUTEN) {
  // Redirects nicht folgen: ein 307 ist hier eine gueltige Antwort, und
  // das Ziel steht ohnehin selbst in der Liste.
  let status;
  try {
    const antwort = await fetch(BASIS + route, { redirect: "manual" });
    status = antwort.status;
    // Den Rumpf abholen, damit das Streaming wirklich durchlaeuft — sonst
    // koennte ein Fehler nach dem ersten Byte unbemerkt bleiben.
    await antwort.text();
  } catch (e) {
    fehler.push(`${route}: Anfrage fehlgeschlagen (${e.message})`);
    continue;
  }
  if (status >= 500) fehler.push(`${route}: HTTP ${status}`);
  console.log(`  ${String(status).padEnd(3)} ${route}`);
}

// Nicht abgefangene Render-Fehler. Next.js markiert sie mit "⨯".
const geworfen = ausgabe
  .split("\n")
  .filter((z) => z.includes("⨯"))
  .map((z) => z.trim());

if (geworfen.length > 0) {
  fehler.push(
    "Beim Rendern wurde geworfen:\n" + [...new Set(geworfen)].map((z) => "    " + z).join("\n"),
  );
}

if (fehler.length > 0) {
  console.error("\nSmoke-Test fehlgeschlagen:\n" + fehler.map((f) => "  - " + f).join("\n"));
  beenden(1);
}

console.log(`\n${ROUTEN.length} Routen gerendert, nichts geworfen.`);
beenden(0);
