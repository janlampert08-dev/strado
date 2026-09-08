"use client";

import { useSyncExternalStore } from "react";

// Serverseitig gerendert wäre das die Uhrzeit des Servers (auf Vercel UTC),
// nicht die des Fahrers — und ein Wert, der sich zwischen Server- und
// Client-Rendering unterscheidet, ist ein Hydration-Mismatch. Deshalb über
// useSyncExternalStore: der Server-Snapshot ist null (es wird nichts
// gerendert), der Client-Snapshot liest die lokale Uhr. Kein Abonnement, weil
// sich die Tageszeit während eines Seitenaufrufs nicht sinnvoll ändert.
function abonnieren() {
  return () => {};
}

function grussFuerStunde(stunde: number): string {
  if (stunde < 11) return "Guten Morgen";
  if (stunde < 18) return "Schön, dich zu sehen";
  return "Guten Abend";
}

function clientGruss(): string {
  return grussFuerStunde(new Date().getHours());
}

function serverGruss(): null {
  return null;
}

/**
 * Tageszeit-Gruss über dem eigenen Namen auf der Profilseite. Bewusst
 * unauffällig (text-sm text-muted) und ohne eigene Überschrift — die Seite
 * soll damit beginnen, dass sie einen wiedererkennt, nicht damit, dass sie
 * etwas ankündigt.
 */
export default function Begruessung() {
  const gruss = useSyncExternalStore(abonnieren, clientGruss, serverGruss);
  if (!gruss) return null;
  return <p className="text-sm text-muted">{gruss}</p>;
}
