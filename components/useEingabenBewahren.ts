"use client";

import { useEffect, type RefObject } from "react";

/**
 * Hält die Eingaben eines `<form action={…}>` fest, wenn React das Formular
 * nach dem Lauf der Server Action zurücksetzt.
 *
 * ---------------------------------------------------------------------------
 * Das Problem
 * ---------------------------------------------------------------------------
 * React 19 ruft nach JEDEM Lauf einer Form Action `form.reset()` auf — auch
 * nach einem Fehlschlag, bei dem die Seite stehen bleibt und die
 * Fehlermeldung erscheint. Alles, was in unkontrollierten Feldern steht,
 * ist danach weg.
 *
 * Getroffen hat das den Weg, den ein neuer Besucher zuerst geht: Anmelden,
 * Registrieren, Passwort vergessen, Passwort ändern. Wer sich vertippt,
 * bekommt "E-Mail oder Passwort ist falsch." und ein leeres Formular —
 * Adresse und Passwort müssen komplett neu getippt werden, auf dem Telefon
 * womöglich im Auto. Das steht als offener Befund in
 * docs/audit/README.md, §B.
 *
 * ---------------------------------------------------------------------------
 * Die Lösung, und warum diese
 * ---------------------------------------------------------------------------
 * Dasselbe Muster, mit dem components/MultiPhotoInput.tsx seit dem
 * Foto-Befund die ausgewählten Dateien rettet: am `reset`-Ereignis
 * mithören, die Werte davor abgreifen, danach zurückschreiben. Der
 * HTML-Standard feuert `reset` VOR dem eigentlichen Zurücksetzen, das
 * Zurückschreiben muss also einen Tick später laufen — daher
 * `queueMicrotask`.
 *
 * Zwei naheliegende Alternativen, beide schlechter:
 *
 * - **Felder kontrolliert machen** (`useState` pro Feld). Würde wirken, aber
 *   jedes Zeichen durch einen Render schicken und die Felder von der
 *   Autovervollständigung des Browsers abhängig machen, die nicht überall
 *   ein `input`-Ereignis feuert. Für ein Anmeldeformular ein hoher Preis.
 * - **Die Werte aus der Action zurückgeben** und als `defaultValue` wieder
 *   hineinreichen (das Muster aus den React-Docs). Für die E-Mail ginge das;
 *   vier der fünf Formulare tragen aber ein Passwortfeld, und dessen Inhalt
 *   soll nicht zusätzlich durch die RSC-Nutzlast zurücklaufen. Hier verlässt
 *   kein Wert je den Browser.
 *
 * ---------------------------------------------------------------------------
 * Grenzen
 * ---------------------------------------------------------------------------
 * Der Haken hängt an JEDEM `reset` des Formulars, nicht nur an dem, den
 * React auslöst. Ein Formular mit einer eigenen "Zurücksetzen"-Schaltfläche
 * (`<button type="reset">`) würde damit nichts mehr zurücksetzen. Kein
 * Formular der App hat eine; wer eine einbaut, darf diesen Haken dort nicht
 * setzen.
 *
 * Dateifelder bleiben ausgespart: ihr `value` lässt sich nicht zuweisen, und
 * für den einen Fall, der zählt, tut MultiPhotoInput das Nötige bereits
 * selbst.
 */
export default function useEingabenBewahren(formRef: RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    function handleReset() {
      const schnappschuss = werteLesen(form!);
      queueMicrotask(() => werteSchreiben(schnappschuss));
    }

    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, [formRef]);
}

// Feldarten, die nichts zu bewahren haben. "file" lässt sich nicht zuweisen
// (siehe oben), die übrigen tragen ihre Beschriftung im value — sie zu
// überschreiben würde die Schaltfläche umbenennen.
const OHNE_EIGENEN_WERT = new Set(["file", "submit", "reset", "button", "image"]);

// Drei Arten, weil ein Feld seinen Zustand an drei verschiedenen Stellen
// trägt: im value, im checked, oder in der Auswahl seiner <option>-Elemente.
// Ein <select multiple> über value zurückzuschreiben verlöre alles ausser
// der ersten Auswahl — deshalb die dritte Art, auch wenn heute nur einfache
// <select> vorkommen.
type Schnappschuss =
  | { art: "wert"; feld: HTMLInputElement | HTMLTextAreaElement; wert: string }
  | { art: "haken"; feld: HTMLInputElement; wert: boolean }
  | { art: "auswahl"; feld: HTMLSelectElement; wert: boolean[] };

export function werteLesen(form: HTMLFormElement): Schnappschuss[] {
  const felder = form.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");

  const gelesen: Schnappschuss[] = [];
  for (const feld of felder) {
    if (feld instanceof HTMLSelectElement) {
      gelesen.push({ art: "auswahl", feld, wert: [...feld.options].map((o) => o.selected) });
      continue;
    }
    if (feld instanceof HTMLInputElement) {
      if (OHNE_EIGENEN_WERT.has(feld.type)) continue;
      if (feld.type === "checkbox" || feld.type === "radio") {
        gelesen.push({ art: "haken", feld, wert: feld.checked });
        continue;
      }
    }
    gelesen.push({ art: "wert", feld, wert: feld.value });
  }
  return gelesen;
}

export function werteSchreiben(schnappschuss: Schnappschuss[]) {
  for (const eintrag of schnappschuss) {
    // Ein Feld, das der Render nach der Action aus dem Dokument genommen hat
    // (etwa der Bestätigungszweig von PasswortVergessenForm), bekommt nichts
    // mehr zugewiesen — sonst schriebe man in einen abgehängten Knoten.
    if (!eintrag.feld.isConnected) continue;

    if (eintrag.art === "haken") {
      eintrag.feld.checked = eintrag.wert;
    } else if (eintrag.art === "auswahl") {
      eintrag.wert.forEach((ausgewaehlt, i) => {
        const option = eintrag.feld.options[i];
        if (option) option.selected = ausgewaehlt;
      });
    } else {
      eintrag.feld.value = eintrag.wert;
    }
  }
}
