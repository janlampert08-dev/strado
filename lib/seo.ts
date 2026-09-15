import type { Metadata } from "next";

/**
 * robots-Wert für Seiten, die nicht in einen Suchindex gehören.
 *
 * Warum das nötig ist, obwohl app/robots.ts schon Disallow-Regeln trägt:
 * ein Disallow verbietet das ABRUFEN, nicht das Indexieren. Eine verlinkte,
 * aber gesperrte Adresse landet weiterhin im Index — nur ohne Inhalt, also
 * als nackte URL ohne Snippet. Dieselbe Überlegung steht seit längerem in
 * app/robots.ts zu /fahrer; sie gilt für jede Seite, auf die aus der App
 * heraus verlinkt wird.
 *
 * Die beiden Werkzeuge schliessen sich deshalb gegenseitig aus:
 *
 * - Soll eine Adresse NICHT im Index stehen → noindex, und der Crawler muss
 *   sie abrufen dürfen (kein Disallow), sonst findet er das noindex nie.
 * - Soll ein ganzer Bereich gar nicht erst abgerufen werden (Last, /api) →
 *   Disallow, und noindex wäre dort wirkungslos.
 *
 * follow: false, weil hinter diesen Seiten nichts liegt, was ein Crawler
 * entdecken soll — sie sind Formulare, Zwischenschritte und
 * Aufzeichnungsschirme. Anders als /fahrer/[id], das noindex mit follow: true
 * trägt: dort stehen Links auf öffentliche Strecken, die gefunden werden
 * dürfen.
 */
export const NICHT_INDEXIEREN: Metadata["robots"] = { index: false, follow: false };
