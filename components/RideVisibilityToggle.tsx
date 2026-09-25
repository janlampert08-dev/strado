"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setCompletionVisibility } from "@/lib/actions/completions";
import { SichtbarkeitIcon } from "@/components/VisibilityIcons";
import {
  SICHTBARKEITEN,
  SICHTBARKEIT_LABEL,
  teilenSperrGrund,
  type Sichtbarkeit,
} from "@/lib/sichtbarkeit";
import { zeigeHinweis } from "@/components/Hinweis";
import IconButton from "@/components/ui/IconButton";
import { Dialog } from "@/components/ui/Dialog";

const BESCHREIBUNG: Record<Sichtbarkeit, string> = {
  privat: "Nur du siehst diese Fahrt.",
  follower: "Wer dir folgt, sieht sie im Feed und auf deinem Profil. Nicht in den Ranglisten.",
  oeffentlich: "Alle sehen sie, auch in den Ranglisten.",
};

// Sichtbarkeit einer gespeicherten Fahrt, direkt in der Liste (Profil,
// erkannte Abschnitte). Seit 0145 drei Stufen statt eines Umschalters.
//
// Eine Auswahl im Dialog statt eines Durchschaltens per Tipp: das führte
// von "privat" nach "öffentlich" über eine Zwischenstufe, die niemand
// wollte. Und ein Dialog statt eines Aufklappmenüs, weil beide Listen, in
// denen der Knopf steht, overflow-hidden tragen — ein absolut positioniertes
// Menü würde an ihrer Unterkante abgeschnitten. Das native <dialog> liegt
// im Top-Layer, darüber.
export default function RideVisibilityToggle({
  completionId,
  sichtbarkeit,
  coveragePercent,
  blockedReason = null,
  stufen = SICHTBARKEITEN,
}: {
  completionId: string;
  sichtbarkeit: Sichtbarkeit;
  // Welche Stufen angeboten werden. Erkannte Abschnitte folgen seit 0151
  // der Öffentlichkeit ihrer Fahrt und bekommen deshalb keine eigene
  // Follower-Stufe, die beim Privatstellen der Fahrt stehen bliebe.
  stufen?: readonly Sichtbarkeit[];
  // Nur bei Streckenfahrten gesetzt — dort entscheidet der Deckungsgrad.
  coveragePercent: number | null;
  // Grund, warum die Fahrt nicht geteilt werden kann (zu kurze freie Fahrt,
  // importiert) — geht dem Deckungsgrad vor, siehe teilenSperrGrund.
  blockedReason?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  // Der Dialog wird beim Schliessen ausgehängt statt geschlossen — den
  // Fokus gibt deshalb nicht der Browser zurück. Zurückgegeben wird er erst
  // NACH dem Aushängen (Effekt unten): solange das modale <dialog> offen
  // ist, ist der Rest der Seite inert und nimmt keinen Fokus an.
  const ausloeserRef = useRef<HTMLButtonElement>(null);
  const warOffen = useRef(false);
  useEffect(() => {
    if (open) {
      warOffen.current = true;
    } else if (warOffen.current) {
      warOffen.current = false;
      ausloeserRef.current?.focus();
    }
  }, [open]);

  function schliessen() {
    setOpen(false);
  }

  // Teilen — mit Followern wie mit allen — hängt an denselben Hürden.
  const sperrGrund = teilenSperrGrund(coveragePercent, blockedReason);

  function waehle(ziel: Sichtbarkeit) {
    schliessen();
    if (ziel === sichtbarkeit) return;
    startTransition(async () => {
      const result = await setCompletionVisibility(completionId, ziel);
      // Als Hinweis statt als Karte am Knopf: die Listen, in denen er steht,
      // schneiden absolut positionierte Elemente an ihrer Unterkante ab.
      if (result.error) zeigeHinweis(result.error);
    });
  }

  return (
    <div className="relative shrink-0">
      <IconButton
        ref={ausloeserRef}
        ton={sichtbarkeit === "privat" ? "neutral" : "aktiv"}
        aria-haspopup="dialog"
        aria-label={`Sichtbarkeit: ${SICHTBARKEIT_LABEL[sichtbarkeit]} — ändern`}
        title={`${SICHTBARKEIT_LABEL[sichtbarkeit]} — ${BESCHREIBUNG[sichtbarkeit]}`}
        // Nicht disabled während des Speicherns: ein deaktivierter Knopf nimmt
        // den zurückgegebenen Fokus nicht an. Ein zweites Öffnen wartet.
        aria-busy={pending}
        className={pending ? "animate-pulse" : undefined}
        onClick={() => {
          if (!pending) setOpen(true);
        }}
      >
        <SichtbarkeitIcon sichtbarkeit={sichtbarkeit} className="h-5 w-5" />
      </IconButton>
      {/* Nur eingehängt, solange offen: im Profil steht dieser Knopf an
          jeder Fahrt, und hundert versteckte Dialoge im DOM braucht es
          nicht. */}
      {open && (
      <Dialog open={open} onClose={schliessen} title="Wer sieht diese Fahrt?">
        {/* Drei Knöpfe statt einer radiogroup: das ARIA-Radiomuster verlangt
            Pfeiltasten und einen einzigen Tab-Stopp. aria-pressed zeigt die
            aktuelle Stufe. */}
        <div className="flex flex-col gap-2">
          {stufen.map((stufe) => {
            const gesperrt = stufe !== "privat" && sperrGrund !== null;
            const aktiv = stufe === sichtbarkeit;
            return (
              <button
                key={stufe}
                type="button"
                aria-pressed={aktiv}
                disabled={gesperrt}
                onClick={() => waehle(stufe)}
                className={`flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-fast ${
                  aktiv ? "border-foreground" : "border-border hover:bg-surface"
                }`}
              >
                {/* Nur Symbol und Name werden bei einer gesperrten Stufe
                    blass — der Grund darunter bleibt voll lesbar. */}
                <SichtbarkeitIcon
                  sichtbarkeit={stufe}
                  className={`mt-0.5 h-4 w-4 shrink-0 ${aktiv ? "text-foreground" : "text-muted"} ${gesperrt ? "opacity-50" : ""}`}
                />
                <span className="flex flex-col gap-0.5">
                  <span className={`text-sm font-medium text-foreground ${gesperrt ? "opacity-50" : ""}`}>
                    {SICHTBARKEIT_LABEL[stufe]}
                  </span>
                  <span className="text-xs text-muted">
                    {gesperrt ? sperrGrund : BESCHREIBUNG[stufe]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Dialog>
      )}
    </div>
  );
}
