import Card from "@/components/ui/Card";
import { TerminIcon, WartungIcon } from "@/components/NavIcons";
import {
  datumText,
  kmText,
  relativeTage,
  type MfkErinnerung,
  type ServiceErinnerung,
  type WartungsStatus as Status,
} from "@/lib/wartung";

// Der Statusblock der Fahrzeugseite: zwei Zeilen, MFK und Service.
//
// Server Component — hier passiert nichts Interaktives, und die Rechnung ist
// bereits in lib/wartungsdaten.ts gelaufen.
//
// Farbe nur, wenn sie etwas sagt: überfällig in --color-danger, fällig in
// --color-warning, alles andere in der normalen Schrift. "In 14 Monaten"
// bunt zu färben wäre ein Alarm ohne Anlass — und die Kilometerzahl ist
// ohnehin eine Untergrenze (siehe lib/wartung.ts).
const FARBE: Record<Status, string> = {
  ok: "text-foreground",
  bald: "text-foreground",
  faellig: "text-warning",
  ueberfaellig: "text-danger",
};

function Zeile({
  icon: Icon,
  titel,
  wert,
  farbe = "text-foreground",
  erklaerung,
}: {
  icon: typeof WartungIcon;
  titel: string;
  wert: string;
  farbe?: string;
  erklaerung?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xs text-muted">{titel}</p>
        <p className={`text-sm font-medium ${farbe}`}>{wert}</p>
        {erklaerung && <p className="text-xs text-muted">{erklaerung}</p>}
      </div>
    </div>
  );
}

function serviceWert(service: ServiceErinnerung): { wert: string; erklaerung?: string; farbe: string } {
  if (service.zustand === "kein_intervall") {
    return { wert: "Kein Intervall gesetzt", farbe: "text-muted", erklaerung: "Trag unten ein, wie oft dieses Fahrzeug zum Service soll." };
  }
  if (service.zustand === "kein_service") {
    return { wert: "Noch kein Service eingetragen", farbe: "text-muted", erklaerung: "Ab dem ersten Serviceeintrag rechnet Strado weiter." };
  }

  const teile: string[] = [];
  if (service.faelligAm) {
    teile.push(
      service.tage !== null && service.tage < 0
        ? `seit ${datumText(service.faelligAm)} fällig`
        : `am ${datumText(service.faelligAm)}`,
    );
  }
  if (service.restKm !== null) {
    teile.push(
      service.restKm < 0
        ? `${kmText(-service.restKm)} darüber`
        : `in höchstens ${kmText(service.restKm)}`,
    );
  }

  const kmHinweis =
    service.kmSeitService === null
      ? null
      : service.kmQuelle === "kilometerstand"
        ? `Mindestens ${kmText(service.kmSeitService)} seit dem Service vom ${datumText(service.letzterServiceAm)}.`
        : `Auf Strado aufgezeichnet seit dem Service: ${kmText(service.kmSeitService)}. Notier beim Service den Kilometerstand, dann wird die Zahl genauer.`;

  return {
    wert: teile.join(" · ") || "Fällig",
    farbe: FARBE[service.status],
    erklaerung: kmHinweis ?? `Letzter Service am ${datumText(service.letzterServiceAm)}.`,
  };
}

export default function WartungsStatus({
  mfk,
  service,
}: {
  mfk: MfkErinnerung;
  service: ServiceErinnerung;
}) {
  const s = serviceWert(service);

  return (
    <Card className="flex flex-col divide-y divide-border">
      {mfk.zustand === "kein_termin" && (
        <Zeile
          icon={TerminIcon}
          titel="Nächste MFK"
          wert="Kein Termin hinterlegt"
          farbe="text-muted"
          erklaerung="Das Datum steht im Aufgebot des Strassenverkehrsamts."
        />
      )}
      {mfk.zustand === "erledigt" && (
        <Zeile
          icon={TerminIcon}
          titel="Nächste MFK"
          wert={`Erledigt am ${datumText(mfk.erledigtAm)}`}
          farbe="text-muted"
          erklaerung={`Der Termin ${datumText(mfk.termin)} gilt damit als wahrgenommen. Trag den neuen ein, sobald das nächste Aufgebot kommt.`}
        />
      )}
      {mfk.zustand === "offen" && (
        <Zeile
          icon={TerminIcon}
          titel="Nächste MFK"
          wert={
            mfk.tage < 0
              ? `Überfällig ${relativeTage(mfk.tage)}`
              : `${datumText(mfk.termin)} · ${relativeTage(mfk.tage)}`
          }
          farbe={FARBE[mfk.status]}
          erklaerung={mfk.tage < 0 ? `Termin war am ${datumText(mfk.termin)}.` : undefined}
        />
      )}
      <Zeile icon={WartungIcon} titel="Nächster Service" wert={s.wert} farbe={s.farbe} erklaerung={s.erklaerung} />
    </Card>
  );
}
