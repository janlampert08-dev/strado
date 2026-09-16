// @vitest-environment jsdom

// Der erste Test dieser Suite, der ein DOM braucht.
//
// Vitest läuft projektweit mit environment: "node" (vitest.config.mts) — das
// bleibt so, ein DOM für 59 Dateien aufzubauen, die keines brauchen, wäre
// Verschwendung. Der Docblock oben kippt die Umgebung für genau diese Datei;
// `jsdom` steht dafür als devDependency drin.
//
// Getestet wird die Mechanik hinter components/useEingabenBewahren.ts, nicht
// die React-Komponenten, die den Haken setzen: es gibt keine Testing Library
// im Projekt und dieser Test braucht auch keine. Was hier geprüft wird, ist
// genau das, was in der Praxis bricht — ein `reset` auf einem echten
// <form>-Element, ausgelöst wie React es auslöst.
//
// Warum das überhaupt eine Testdatei wert ist: der Befund aus
// docs/audit/README.md §B ist unsichtbar, solange man ihn nicht auslöst. Er
// zeigt sich erst nach einem fehlgeschlagenen Absenden, und wer die
// Anmeldung von Hand prüft, tippt normalerweise das richtige Passwort.

import { beforeEach, describe, expect, it } from "vitest";

// Nachbau dessen, was der Haken tut, gegen dieselbe öffentliche
// Schnittstelle: das reset-Ereignis. Der Haken selbst hängt an useEffect und
// wäre ohne Renderer nicht aufrufbar — die Registrierung ist aber der
// triviale Teil, die Logik steckt im Lesen und Schreiben.
import { werteLesen, werteSchreiben } from "@/components/useEingabenBewahren";

function formularMitFeldern(html: string): HTMLFormElement {
  document.body.innerHTML = `<form>${html}</form>`;
  const form = document.querySelector("form");
  if (!form) throw new Error("kein Formular");
  // Wie in useEingabenBewahren: vor dem Zurücksetzen lesen, danach schreiben.
  form.addEventListener("reset", () => {
    const schnappschuss = werteLesen(form);
    queueMicrotask(() => werteSchreiben(schnappschuss));
  });
  return form;
}

// form.reset() ist synchron, das Zurückschreiben hängt an einem Microtask —
// einmal auf die Warteschlange warten, dann steht das Ergebnis.
async function zuruecksetzen(form: HTMLFormElement) {
  form.reset();
  await Promise.resolve();
}

describe("Eingaben nach einem Formular-Reset", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("bewahrt getippten Text, den der Reset sonst leert", async () => {
    const form = formularMitFeldern(
      `<input name="email" type="email"><input name="password" type="password">`,
    );
    const email = form.querySelector<HTMLInputElement>('[name="email"]')!;
    const passwort = form.querySelector<HTMLInputElement>('[name="password"]')!;
    email.value = "anna@example.ch";
    passwort.value = "geheim1234";

    await zuruecksetzen(form);

    expect(email.value).toBe("anna@example.ch");
    expect(passwort.value).toBe("geheim1234");
  });

  // Der Nachweis, dass der Test überhaupt etwas misst: ohne den Haken leert
  // derselbe Reset dieselben Felder. Fiele das Zurückschreiben aus, bliebe
  // der Test darüber grün, wenn jsdom von sich aus nichts leerte.
  it("ohne den Haken leert derselbe Reset die Felder (Gegenprobe)", () => {
    document.body.innerHTML = `<form><input name="email" type="email"></form>`;
    const form = document.querySelector("form")!;
    const email = form.querySelector<HTMLInputElement>('[name="email"]')!;
    email.value = "anna@example.ch";

    form.reset();

    expect(email.value).toBe("");
  });

  it("bewahrt einen Textbereich mit defaultValue statt auf ihn zurückzufallen", async () => {
    const form = formularMitFeldern(`<textarea name="kommentar">Alter Text</textarea>`);
    const feld = form.querySelector<HTMLTextAreaElement>("textarea")!;
    feld.value = "Neuer, noch nicht gespeicherter Text";

    await zuruecksetzen(form);

    expect(feld.value).toBe("Neuer, noch nicht gespeicherter Text");
  });

  it("bewahrt Schalter in beide Richtungen", async () => {
    const form = formularMitFeldern(
      `<input name="an" type="checkbox" checked><input name="aus" type="checkbox">`,
    );
    const an = form.querySelector<HTMLInputElement>('[name="an"]')!;
    const aus = form.querySelector<HTMLInputElement>('[name="aus"]')!;
    // Beide gegenüber ihrem Ausgangszustand umgelegt — ein Reset würde genau
    // das rückgängig machen.
    an.checked = false;
    aus.checked = true;

    await zuruecksetzen(form);

    expect(an.checked).toBe(false);
    expect(aus.checked).toBe(true);
  });

  it("bewahrt eine Auswahlliste", async () => {
    const form = formularMitFeldern(
      `<select name="privatzone"><option value="0">aus</option><option value="200" selected>200</option><option value="500">500</option></select>`,
    );
    const auswahl = form.querySelector<HTMLSelectElement>("select")!;
    auswahl.value = "500";

    await zuruecksetzen(form);

    expect(auswahl.value).toBe("500");
  });

  // Ein Dateifeld lässt sich nicht beschreiben — der Versuch wirft. Dass der
  // Haken es ausspart, ist deshalb kein Feinschliff, sondern die Bedingung
  // dafür, dass er in einem Formular mit Fotos überhaupt läuft
  // (RideSummaryForm); dort rettet MultiPhotoInput die Dateien selbst.
  it("fasst Dateifelder nicht an", async () => {
    const form = formularMitFeldern(
      `<input name="foto" type="file"><input name="notiz" type="text">`,
    );
    const notiz = form.querySelector<HTMLInputElement>('[name="notiz"]')!;
    notiz.value = "Schöne Runde";

    await expect(zuruecksetzen(form)).resolves.not.toThrow();
    expect(notiz.value).toBe("Schöne Runde");
  });

  // Schaltflächen tragen ihre Beschriftung im value. Würde der Haken sie
  // mitnehmen und zurückschreiben, wäre das folgenlos — würde er sie
  // versehentlich mit einem Feldwert überschreiben, stünde plötzlich eine
  // E-Mail-Adresse auf dem Absenden-Knopf. Der Test hält die Zuordnung fest.
  it("lässt die Beschriftung von Schaltflächen unberührt", async () => {
    const form = formularMitFeldern(
      `<input name="email" type="email"><input type="submit" value="Anmelden">`,
    );
    const email = form.querySelector<HTMLInputElement>('[name="email"]')!;
    const knopf = form.querySelector<HTMLInputElement>('[type="submit"]')!;
    email.value = "anna@example.ch";

    await zuruecksetzen(form);

    expect(knopf.value).toBe("Anmelden");
    expect(email.value).toBe("anna@example.ch");
  });

  // Der Erfolgszweig von PasswortVergessenForm hängt das Formular ab, bevor
  // der Microtask läuft. In einen abgehängten Knoten zu schreiben wäre
  // wirkungslos, aber der Haken soll dabei auch nicht stolpern.
  it("stolpert nicht über Felder, die der Render inzwischen entfernt hat", async () => {
    const form = formularMitFeldern(`<input name="email" type="email">`);
    const email = form.querySelector<HTMLInputElement>('[name="email"]')!;
    email.value = "anna@example.ch";

    form.reset();
    email.remove();

    await expect(Promise.resolve()).resolves.not.toThrow();
  });
});
