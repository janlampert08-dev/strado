import type { ComponentType } from "react";
import {
  WetterGewitterIcon,
  WetterKaltIcon,
  WetterRegenIcon,
  WetterSchauerIcon,
  WetterSchneeIcon,
  WetterTrockenIcon,
  WetterWindIcon,
} from "@/components/NavIcons";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";
import {
  besteTage,
  tageAufzaehlen,
  tagVorlesen,
  wochentagKurz,
  type WetterGrund,
} from "@/lib/wetterfenster";
import {
  ladeFavoritenWetter,
  ladeWetterfenster,
  WETTER_FAVORITEN_MAX,
  type WetterStrecke,
} from "@/lib/wetterfensterLaden";
import type { FahrzeugTyp } from "@/types/database";

// Das Wetterfenster (Premium) an seinen zwei Orten: als Streifen unter der
// Wetter-Zeile der Streckenseite und als kurze Übersicht in den Favoriten
// des Profils. Beides sind async Server Components, die ihre Vorhersage
// selbst holen — die Seiten hängen sie in eine Suspense-Grenze, damit
// Open-Meteo nie den Rest der Seite aufhält.
//
// Das Gate steht NICHT hier, sondern an den Einbaustellen
// (premiumStatus.aktiv): wer diese Komponenten rendert, löst einen Abruf
// aus, und genau das soll beim Lesen der Seite sichtbar sein.

const GRUND_ICON: Record<WetterGrund, ComponentType<{ className?: string }> | null> = {
  trocken: WetterTrockenIcon,
  schauer: WetterSchauerIcon,
  regen: WetterRegenIcon,
  gewitter: WetterGewitterIcon,
  schnee: WetterSchneeIcon,
  glaette: WetterKaltIcon,
  kalt: WetterKaltIcon,
  boeen: WetterWindIcon,
  unbekannt: null,
};

/**
 * Sieben Tage als eine Zeile. Auf 360 px bleiben pro Tag rund 42 px — genug
 * für Wochentag, Symbol und Temperatur, nicht für den Grund. Der steht
 * deshalb vollständig im Vorlesetext jeder Zelle, und die sehende Person
 * bekommt darunter die eine Aussage, um die es geht: welche Tage.
 *
 * Die Stufe hängt nie an der Farbe allein. Gute Tage tragen eine Fläche,
 * Tage mit Vorbehalt nur den Rahmen, schlechte keins von beidem; dazu sagt
 * das Symbol den Grund. Kein Akzentblau: Blau heisst in dieser App
 * "antippbar", und die Zellen sind es nicht.
 */
export async function WetterfensterStreifen({
  strecke,
  fahrzeug,
}: {
  strecke: WetterStrecke;
  fahrzeug: FahrzeugTyp;
}) {
  const fenster = await ladeWetterfenster(strecke, fahrzeug);
  if (!fenster) return null;

  const { tage, heute, hoechsterPunktM } = fenster;
  const beste = besteTage(tage);
  const massstab = fahrzeug === "motorrad" ? "fürs Motorrad" : "fürs Auto";
  const ort = hoechsterPunktM !== null ? `Start und ${hoechsterPunktM} m` : "am Start";

  return (
    <div className="flex flex-col gap-2">
      <ol role="list" aria-label="Fahrwetter der nächsten Tage" className="grid grid-cols-7 gap-1">
        {tage.map((t) => {
          const Icon = GRUND_ICON[t.grund];
          const istHeute = t.datum === heute;
          return (
            <li
              key={t.datum}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border py-2",
                t.stufe === "gut" && "border-border bg-surface",
                t.stufe === "moeglich" && "border-border",
                (t.stufe === "schlecht" || t.stufe === null) && "border-transparent",
              )}
            >
              <span className="sr-only">{tagVorlesen(t, istHeute)}</span>
              <span aria-hidden="true" className="text-xs text-muted">
                {istHeute ? "Heute" : wochentagKurz(t.datum)}
              </span>
              {Icon ? (
                <Icon
                  aria-hidden="true"
                  className={cn("h-4 w-4", t.stufe === "gut" ? "text-foreground" : "text-muted")}
                />
              ) : (
                <span aria-hidden="true" className="h-4 text-xs leading-4 text-muted">
                  —
                </span>
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "text-xs tabular-nums",
                  t.stufe === "schlecht" || t.stufe === null ? "text-muted" : "text-foreground",
                )}
              >
                {t.tempMaxC !== null ? `${t.tempMaxC}°` : "—"}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-muted">
        {beste.length > 0 ? (
          <>
            Beste Tage:{" "}
            <span className="text-foreground">{tageAufzaehlen(beste, heute)}</span>
          </>
        ) : (
          "Diese Woche kein guter Tag in Sicht"
        )}
        <span aria-hidden="true"> · </span>
        <span className="text-xs">
          {ort}, {massstab}
        </span>
      </p>
    </div>
  );
}

/** Platzhalter in derselben Höhe, damit die Seite beim Nachladen nicht springt. */
export function WetterfensterStreifenPlatzhalter() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-[74px] w-full rounded-lg" />
      <Skeleton className="h-5 w-2/3 rounded-md" />
    </div>
  );
}

/**
 * "Beste Tage diese Woche" über die Favoriten. Gedeckelt auf
 * WETTER_FAVORITEN_MAX Strecken: jede ist ein Aufruf bei Open-Meteo, und wer
 * vierzig Favoriten hat, soll nicht vierzig Abfragen pro Profilaufruf
 * auslösen. Es sind die zuletzt gemerkten — die Liste darunter ist genauso
 * sortiert, die Übersicht beschreibt also ihren Anfang.
 */
export async function WetterfensterFavoriten({
  routeIds,
  fahrzeug,
}: {
  routeIds: string[];
  fahrzeug: FahrzeugTyp;
}) {
  const strecken = await ladeFavoritenWetter(routeIds, fahrzeug);
  if (strecken.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      <p className="text-sm font-medium">Beste Tage diese Woche</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {strecken.map(({ id, name, fenster }) => {
          const beste = besteTage(fenster.tage);
          return (
            <li key={id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">{name}</span>
              {beste.length > 0 ? (
                <>
                  <span aria-hidden="true" className="shrink-0 tabular-nums">
                    {tageAufzaehlen(beste, fenster.heute, true)}
                  </span>
                  <span className="sr-only">{tageAufzaehlen(beste, fenster.heute)}</span>
                </>
              ) : (
                <span className="shrink-0 text-muted">keiner in Sicht</span>
              )}
            </li>
          );
        })}
      </ul>
      {routeIds.length > WETTER_FAVORITEN_MAX && (
        <p className="text-xs text-muted">Für deine {WETTER_FAVORITEN_MAX} zuletzt gemerkten Strecken.</p>
      )}
    </div>
  );
}

export function WetterfensterFavoritenPlatzhalter() {
  return (
    <div className="mb-4 flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-5 w-40 rounded-md" />
      <Skeleton className="h-5 w-full rounded-md" />
      <Skeleton className="h-5 w-full rounded-md" />
    </div>
  );
}
