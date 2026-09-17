import PremiumHinweis from "@/components/PremiumHinweis";
import PassAlarmSchalter from "@/components/PassAlarmSchalter";
import { passStatusAnzeige, type PassStatus } from "@/lib/passStatus";

// Der Passstatus auf der Streckenseite (0112): eine Zeile unter dem Titel,
// keine Kachel.
//
// Warum keine Kennzahl-Kachel: die vier Kacheln weiter unten tragen
// dauerhafte Eigenschaften der Strasse (Länge, Höhe, Kehren, Fahrzeit). Der
// Status ist das Gegenteil davon — eine Momentaufnahme mit Prüfdatum, und
// genau aus dem Grund, aus dem das Wetter aus den Kacheln herausgenommen
// wurde (siehe app/strecken/[id]/page.tsx), gehört er nicht dazu. Er steht
// dort, wo man ihn vor der Abfahrt sucht: direkt beim Namen.
//
// Der Status ist für alle sichtbar, ohne Konto und ohne Abo. Ein gesperrter
// Pass ist Sicherheitsinformation, und die gehört nicht hinter die Paywall
// (docs/premium-naechste-features.md). Verkauft wird allein die Meldung.
//
// Die Farbe: nur ein Punkt, und nur bei "offen" grün. Gesperrt und
// Wintersperre bleiben in der Vordergrundfarbe — ein rot leuchtender Pass
// wäre eine Warnung, wo eine Auskunft steht, und die App hält Rot für
// Handlungen mit Folgen (docs/design-vereinfachung.md).
const PUNKT_KLASSE: Record<string, string> = {
  offen: "bg-success",
  gesperrt: "bg-muted",
  wintersperre: "bg-muted",
};

export default function PassStatusZeile({
  routeId,
  status,
  alarmAktiv,
  angemeldet,
  istPremium,
  jetzt = new Date(),
}: {
  routeId: string;
  /** null = für diesen Pass ist noch nichts erfasst. */
  status: PassStatus | null;
  alarmAktiv: boolean;
  angemeldet: boolean;
  istPremium: boolean;
  jetzt?: Date;
}) {
  const anzeige = status ? passStatusAnzeige(status, jetzt) : null;

  // Nichts erfasst und niemand angemeldet: die Zeile hat keinen Inhalt.
  // Eine Leermeldung ("kein Status erfasst") wäre eine Zeile Platz für
  // nichts — die Streckenseite ist lang genug.
  if (!anzeige && !angemeldet) return null;

  return (
    <div className="flex flex-col gap-2">
      {anzeige && (
        <div className="flex flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${PUNKT_KLASSE[anzeige.wert] ?? "bg-muted"}`}
            />
            <span className="font-medium">{anzeige.label}</span>
            {anzeige.zusatz && <span className="text-muted">· {anzeige.zusatz}</span>}
            {/* Das Prüfdatum steht immer dabei, nicht nur wenn es alt ist:
                ein falsch als offen gemeldeter Pass ist schlimmer als gar
                keine Angabe (docs/markt/schweizer-identitaet.md §2.1).
                Veraltet heisst nicht ausgeblendet — es heisst, dass das
                Datum hervortritt und die Angabe sich selbst relativiert. */}
            <span className={anzeige.veraltet ? "text-warning" : "text-muted"}>
              · {anzeige.geprueft}
              {anzeige.veraltet && " (nicht mehr aktuell)"}
            </span>
          </p>
          {(status?.hinweis || status?.quelle) && (
            <p className="text-xs text-muted">
              {status.hinweis}
              {status.hinweis && status.quelle && " · "}
              {status.quelle && `Quelle: ${status.quelle}`}
            </p>
          )}
        </div>
      )}

      {/* Der Alarm nur für angemeldete Konten: ohne Konto gibt es keine
          Aktivitätsliste, in der die Meldung landen könnte. */}
      {angemeldet &&
        (istPremium || alarmAktiv ? (
          <PassAlarmSchalter routeId={routeId} aktiv={alarmAktiv} ruht={!istPremium} />
        ) : (
          <PremiumHinweis>
            Mit Premium meldet Strado dir, sobald der Pass offen ist
          </PremiumHinweis>
        ))}
    </div>
  );
}
