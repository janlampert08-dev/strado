"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import {
  getOfflineRoute,
  isIndexedDbAvailable,
  removeOfflineRoute,
  saveOfflineRouteMitGrenze,
  type OfflineRoute,
} from "@/lib/offlineRoutes";
import { MAX_OFFLINE_STRECKEN_GRATIS } from "@/lib/premiumLimits";
import IconButton from "@/components/ui/IconButton";

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
// Die Entscheidung fällt in saveOfflineRouteMitGrenze und nicht hier: die
// Zählung gehört in dieselbe IndexedDB-Transaktion wie der Schreibvorgang,
// damit die geprüfte Grenze auch die tatsächliche ist — zwei offene Tabs
// sähen sonst beide dieselbe veraltete Zahl.
//
// Diese Komponente führte bis zur Umstellung auf ui/IconButton eine eigene
// Kopie des Zählers mit, allein um die Beschriftung auf "Offline speichern
// (Premium)" umzuschalten, sobald das Kontingent knapp wurde. Die
// Beschriftung ist weg (der Preis gehört nicht an ein Bedienelement im
// Ruhezustand, siehe docs/design-vereinfachung.md Anhang C2), und damit
// auch der Zähler: er war der einzige Leser. Der Hinweis unten kommt
// weiterhin aus dem Rückgabewert der Transaktion — also von der Stelle, die
// es wirklich weiss.
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
  const [hinweis, setHinweis] = useState<string | null>(null);

  useEffect(() => {
    if (!isIndexedDbAvailable()) return;
    getOfflineRoute(route.id)
      .then((existing) => {
        setSaved(existing !== null);
      })
      .catch(() => setSaved(false));
  }, [route.id]);

  if (!isIndexedDbAvailable() || saved === null) return null;


  async function toggle() {
    setPending(true);
    setHinweis(null);
    try {
      if (saved) {
        await removeOfflineRoute(route.id);
        setSaved(false);
      } else {
        const ergebnis = await saveOfflineRouteMitGrenze(
          route,
          istPremium ? null : MAX_OFFLINE_STRECKEN_GRATIS,
        );
        if (ergebnis === "kontingent_erschoepft") {
          setHinweis(
            `Ohne Premium lassen sich ${MAX_OFFLINE_STRECKEN_GRATIS} Strecken offline speichern. ` +
              "Entferne eine andere — oder hol dir Premium für unbegrenzt viele.",
          );
          return;
        }
        setSaved(true);
      }
    } catch {
      // Zustand unverändert lassen, der Button bleibt für einen erneuten
      // Versuch bedienbar — aber nicht mehr stumm: Ohne Meldung sah der
      // Nutzer den Button nur kurz ausgrauen und zurückspringen. Der
      // Kontingent-Zweig oben nutzt dieselbe Mechanik.
      //
      // Beide Zweige landen hier, deshalb entscheidet `saved`, welche
      // Meldung passt: Es beschreibt noch den Zustand VOR dem Versuch (die
      // setSaved-Aufrufe stehen hinter dem await), zeigt also, welche
      // Operation gescheitert ist.
      setHinweis(
        saved
          ? "Die Strecke konnte nicht aus dem Offline-Speicher entfernt werden. " +
              "Bitte versuche es erneut."
          : // Beim Speichern ist der wahrscheinlichste Auslöser ein
            // QuotaExceededError bei vollem Gerätespeicher, und genau dann
            // scheitert ein zweiter Versuch garantiert wieder — deshalb hier
            // ein Rat statt einer blossen Wiederholungsaufforderung.
            "Speichern nicht möglich — vermutlich ist der Speicher dieses Geräts voll. " +
            "Entferne eine andere Offline-Strecke und versuche es erneut.",
      );
    } finally {
      setPending(false);
    }
  }

  // Die Beschriftung trug bisher "(Premium)", sobald das Gratis-Kontingent
  // knapp war — also ein Preis am Bedienelement selbst, dauerhaft sichtbar.
  // Der HINWEIS darunter war schon immer richtig: er erscheint erst, wenn
  // die drei Strecken wirklich voll sind. Nur die Beschriftung nahm das
  // vorweg. Jetzt trägt sie es nicht mehr; der Hinweis bleibt unverändert.
  // Siehe docs/design-vereinfachung.md, Anhang C2, Regel 1.
  const label = saved ? "Offline-Kopie löschen" : "Offline verfügbar machen";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <IconButton
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        ton={saved ? "aktiv" : "neutral"}
        title={label}
        aria-label={label}
      >
        {saved ? (
          <Trash2 className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Download className="h-5 w-5" aria-hidden="true" />
        )}
      </IconButton>
      {hinweis && (
        <p role="status" className="text-sm text-muted">
          {hinweis}{" "}
          <Link href="/profil/premium" className="underline">
            Mehr erfahren
          </Link>
        </p>
      )}
    </div>
  );
}
