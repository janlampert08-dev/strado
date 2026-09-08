"use client";

import { useSyncExternalStore } from "react";

// Serverseitig gerendert wäre das die Uhrzeit des Servers (auf Vercel UTC),
// nicht die des Fahrers — und ein Wert, der sich zwischen Server- und
// Client-Rendering unterscheidet, ist ein Hydration-Mismatch. Deshalb über
// useSyncExternalStore: der Server-Snapshot ist null (es wird nichts
// gerendert), der Client-Snapshot liest die lokale Uhr. Kein Abonnement, weil
/**
 * Provides an inert subscription for the greeting store.
 *
 * @returns A function that unsubscribes from the store.
 */
function abonnieren() {
  return () => {};
}

/**
 * Selects a German greeting based on the hour of the day.
 *
 * @param stunde - The hour of the day
 * @returns The greeting for the specified hour
 */
function grussFuerStunde(stunde: number): string {
  if (stunde < 11) return "Guten Morgen";
  if (stunde < 18) return "Schön, dich zu sehen";
  return "Guten Abend";
}

/**
 * Determines the greeting for the client's current local hour.
 *
 * @returns The time-based greeting for the current local hour.
 */
function clientGruss(): string {
  return grussFuerStunde(new Date().getHours());
}

/**
 * Provides the server-side greeting snapshot.
 *
 * @returns `null`
 */
function serverGruss(): null {
  return null;
}

/**
 * Displays a localized time-of-day greeting.
 *
 * @returns The greeting paragraph, or `null` when no greeting is available.
 */
export default function Begruessung() {
  const gruss = useSyncExternalStore(abonnieren, clientGruss, serverGruss);
  if (!gruss) return null;
  return <p className="text-sm text-muted">{gruss}</p>;
}
