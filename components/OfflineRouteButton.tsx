"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import {
  getAllOfflineRoutes,
  getOfflineRoute,
  isIndexedDbAvailable,
  removeOfflineRoute,
  saveOfflineRouteMitGrenze,
  type OfflineRoute,
} from "@/lib/offlineRoutes";
import { MAX_OFFLINE_STRECKEN_GRATIS } from "@/lib/premiumLimits";
import { buttonVariants } from "@/components/ui/Button";

// route wird bereits fertig auf das schlanke OfflineRoute-Shape reduziert
// von der Seite übergeben (app/strecken/[id]/page.tsx) — eine reine
// Server→Client-Datenprop, keine Funktion, also unproblematisch über die
// Komponentengrenze serialisierbar.
// Die Mengenbegrenzung ist hier — anders als bei allen anderen
// Premium-Grenzen — bewusst NUR im Client. Offline gespeicherte Strecken
// liegen ausschliesslich in der IndexedDB des eigenen Browsers, gehen nie
// über den Server und kosten uns nichts. Es gibt also keine Serverseite, auf
// der sich etwas durchsetzen liesse, und auch nichts zu schützen: wer die
// Grenze über die Entwicklerkonsole umgeht, füllt seinen eigenen
// Gerätespeicher.
//
// Ausdrücklich hingeschrieben, damit diese Stelle nicht als vergessene
// serverseitige Prüfung gelesen wird. Bei den Fotos und den privaten
// Strecken ist es genau umgekehrt: dort ist die Clientgrenze Anzeige und die
// Schranke sitzt im Server.
//
// Die Entscheidung fällt trotzdem in saveOfflineRouteMitGrenze und nicht
// hier: `anzahl` unten ist Anzeige, und zwei offene Tabs sähen beide
// dieselbe Zahl. Die Zählung gehört in dieselbe IndexedDB-Transaktion wie
// der Schreibvorgang, damit die angezeigte Grenze auch die tatsächliche ist.
export default function OfflineRouteButton({
  route,
  istPremium,
}: {
  route: OfflineRoute;
  istPremium: boolean;
}) {
  // null = noch nicht geprüft (IndexedDB-Zugriff ist async) — erst danach
  // wird der Button gerendert, damit er nicht kurz im falschen Zustand
  // aufblitzt. Lazy-Initializer statt Effekt für den "nicht verfügbar"-Fall,
  // damit der Effekt selbst keinen synchronen setState-Aufruf mehr braucht
  // (nur noch in den .then()/.catch()-Callbacks, siehe unten).
  const [saved, setSaved] = useState<boolean | null>(() => (isIndexedDbAvailable() ? null : false));
  const [pending, setPending] = useState(false);
  const [anzahl, setAnzahl] = useState(0);
  const [hinweis, setHinweis] = useState<string | null>(null);

  useEffect(() => {
    if (!isIndexedDbAvailable()) return;
    Promise.all([getOfflineRoute(route.id), getAllOfflineRoutes()])
      .then(([existing, alle]) => {
        setSaved(existing !== null);
        setAnzahl(alle.length);
      })
      .catch(() => setSaved(false));
  }, [route.id]);

  if (!isIndexedDbAvailable() || saved === null) return null;

  // Nur für die Beschriftung: die verbindliche Entscheidung trifft
  // saveOfflineRouteMitGrenze in der Transaktion.
  const kontingentKnapp = !istPremium && !saved && anzahl >= MAX_OFFLINE_STRECKEN_GRATIS;

  async function toggle() {
    setPending(true);
    setHinweis(null);
    try {
      if (saved) {
        await removeOfflineRoute(route.id);
        setSaved(false);
        setAnzahl((n) => Math.max(0, n - 1));
      } else {
        const ergebnis = await saveOfflineRouteMitGrenze(
          route,
          istPremium ? null : MAX_OFFLINE_STRECKEN_GRATIS,
        );
        if (ergebnis === "kontingent_erschoepft") {
          setHinweis(
            `Ohne Premium lassen sich ${MAX_OFFLINE_STRECKEN_GRATIS} Strecken offline speichern. ` +
              "Entferne eine andere — oder unterstütze Strado für unbegrenzt viele.",
          );
          const alle = await getAllOfflineRoutes();
          setAnzahl(alle.length);
          return;
        }
        setSaved(true);
        setAnzahl((n) => n + 1);
      }
    } catch {
      // Speicher voll o.ä. — Zustand unverändert lassen, Button bleibt
      // bedienbar für einen erneuten Versuch.
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        {saved ? (
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {saved ? "Offline entfernen" : kontingentKnapp ? "Offline download (Premium)" : "Offline download"}
      </button>
      {hinweis && (
        <p role="status" className="text-xs text-muted">
          {hinweis}{" "}
          <Link href="/profil/premium" className="underline">
            Mehr erfahren
          </Link>
        </p>
      )}
    </div>
  );
}
