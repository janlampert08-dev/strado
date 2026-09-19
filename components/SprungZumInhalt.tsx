"use client";

// Der Sprunglink, der auf jeder Seite das erste fokussierbare Element ist.
//
// Vor ihm musste jede Tastaturbedienung erst durch den Kopf, die
// Hauptnavigation und — auf der Startseite — durch die Mapbox-Bedienelemente,
// bevor der eigentliche Inhalt kam. Auf der Streckenseite gibt es diesen
// Sprung seit je (RouteDetailLayout, "Zur Streckeninfo"); überall sonst
// fehlte er.
//
// WARUM EIN KNOPF UND KEIN href="#inhalt": Die Seiten dieser App bringen
// ihren eigenen <main> mit, teils mit eigener Scrollfläche, teils ganz ohne.
// Ein Anker bräuchte in jeder einzelnen Datei eine id, und die Datei, die
// sie vergisst, bekommt einen Sprunglink, der ins Leere zeigt — schlimmer
// als keiner. Hier sucht der Knopf stattdessen beim Klick das erste <main>
// und gibt ihm den Fokus. Ein Landmark ist nicht von sich aus fokussierbar,
// deshalb das tabIndex="-1", das gleich danach wieder verschwindet: es soll
// nur diesen einen Fokus aufnehmen und nicht dauerhaft im Baum stehen.
//
// WARUM DER ERSATZWEG MEHR TUT ALS "erstes Geschwister hinter dem Kopf":
// Genau das war er vorher, und damit zeigte er auf fast jeder Seite auf die
// Navigation — also auf das, was ein Sprunglink überspringen soll. <Header />
// rendert Sprunglink, <header>, den Aufzeichnungsstreifen (meist null) und
// <BottomNav> als Geschwister in denselben Container wie den Seiteninhalt;
// hinter dem Kopf steht deshalb das <nav> von BottomNav. Ab md ist dieses
// nav zusätzlich `md:hidden`, und ein Fokus auf ein display:none-Element
// verpufft: der Knopf tat dort schlicht nichts. Nur app/verifiziert und die
// Premium-Seiten bringen ein eigenes <main> mit — der ganze Kernablauf
// (Start, /feed, /strecken/[id], /profil, /paesse, /ranglisten) nicht.
// Der Ersatzweg geht die Geschwister deshalb weiter, bis eines kommt, das
// weder Navigation noch unsichtbar ist.
// Das erste Geschwister hinter dem Kopf, das Inhalt sein kann: keine
// Navigation und nicht unsichtbar. getClientRects() ist leer, sobald ein
// Element oder einer seiner Vorfahren display:none trägt — damit fällt
// BottomNav ab md heraus, ohne dass diese Datei die Breakpoints kennt.
function ersteInhaltsflaeche(): HTMLElement | null {
  let kandidat = document.querySelector("header")?.nextElementSibling ?? null;
  while (kandidat) {
    if (
      kandidat instanceof HTMLElement &&
      kandidat.tagName !== "NAV" &&
      kandidat.getAttribute("role") !== "navigation" &&
      kandidat.getAttribute("aria-hidden") !== "true" &&
      kandidat.getClientRects().length > 0
    ) {
      return kandidat;
    }
    kandidat = kandidat.nextElementSibling;
  }
  return null;
}

export default function SprungZumInhalt() {
  return (
    <button
      type="button"
      onClick={() => {
        const ziel =
          document.querySelector<HTMLElement>("main") ?? ersteInhaltsflaeche();
        if (!ziel) return;
        ziel.setAttribute("tabindex", "-1");
        ziel.focus({ preventScroll: true });
        ziel.scrollIntoView({ block: "start", behavior: "smooth" });
        ziel.addEventListener("blur", () => ziel.removeAttribute("tabindex"), { once: true });
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-overlay"
    >
      Zum Inhalt springen
    </button>
  );
}
