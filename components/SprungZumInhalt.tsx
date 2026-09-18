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
// (ersatzweise das erste Geschwister hinter dem Kopf) und gibt ihm den
// Fokus. Ein Landmark ist nicht von sich aus fokussierbar, deshalb das
// tabIndex="-1", das gleich danach wieder verschwindet: es soll nur diesen
// einen Fokus aufnehmen und nicht dauerhaft im Baum stehen.
export default function SprungZumInhalt() {
  return (
    <button
      type="button"
      onClick={() => {
        const ziel =
          document.querySelector<HTMLElement>("main") ??
          document.querySelector<HTMLElement>("header")?.nextElementSibling;
        if (!(ziel instanceof HTMLElement)) return;
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
