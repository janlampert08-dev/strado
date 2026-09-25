"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Clock, UserPlus, UserCheck } from "@/components/NavIcons";
import { toggleFollow } from "@/lib/actions/follows";
import { buttonVariants } from "@/components/ui/Button";
import { zeigeHinweis } from "@/components/Hinweis";
import type { FolgeZustand } from "@/lib/follows";

const RUECKFRAGE_MS = 4000;

// Gleiches optimistisches Toggle-Muster wie FavoriteButton.tsx/KudosButton.tsx
// — seit 0146 mit einem dritten Zustand: "angefragt", wenn das Profil neue
// Follower bestätigt.
//
// Der Knopf schickt den angezeigten Zustand mit; der Server handelt nur,
// wenn er noch stimmt (siehe toggleFollow), und meldet sonst den echten
// Stand zurück. Die Regel des Profils (Bestätigung ja/nein) übernimmt der
// Knopf ebenfalls aus jeder Antwort, statt beim Stand vom Laden zu bleiben.
export default function FollowButton({
  targetUserId,
  initialZustand,
  brauchtBestaetigung: brauchtBestaetigungBeimLaden,
}: {
  targetUserId: string;
  initialZustand: FolgeZustand;
  brauchtBestaetigung: boolean;
}) {
  const [zustand, setZustand] = useState<FolgeZustand>(initialZustand);
  const [brauchtBestaetigung, setBrauchtBestaetigung] = useState(brauchtBestaetigungBeimLaden);
  // Entfolgen eines Profils mit Bestätigung lässt sich nicht rückgängig
  // machen — erneut folgen wäre eine neue Anfrage. Deshalb dort ein zweiter
  // Tipp: der erste fragt nach, der zweite (innert 4 s) entfolgt.
  const [rueckfrage, setRueckfrage] = useState(false);
  // Der aktuelle Stand für Aufrufe, die ausserhalb eines Renders passieren
  // (das Rückgängig im Hinweis) — ohne ihn sähe es den Stand von damals.
  const zustandRef = useRef(zustand);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!rueckfrage) return;
    const t = setTimeout(() => setRueckfrage(false), RUECKFRAGE_MS);
    return () => clearTimeout(t);
  }, [rueckfrage]);

  function setzen(neu: FolgeZustand) {
    zustandRef.current = neu;
    setZustand(neu);
  }

  function tippen() {
    if (zustandRef.current === "folgt" && brauchtBestaetigung && !rueckfrage) {
      setRueckfrage(true);
      return;
    }
    setRueckfrage(false);
    umschalten();
  }

  function umschalten() {
    const angezeigt = zustandRef.current;
    const erwartet: FolgeZustand =
      angezeigt !== "keiner" ? "keiner" : brauchtBestaetigung ? "angefragt" : "folgt";
    setzen(erwartet);
    startTransition(async () => {
      const result = await toggleFollow(targetUserId, angezeigt);
      if (!result.ok || !result.zustand) {
        setzen(angezeigt);
        zeigeHinweis(
          result.gebremst
            ? "Einen Moment — bitte gleich noch einmal tippen."
            : "Das hat nicht geklappt. Bitte versuche es noch einmal.",
        );
        return;
      }
      setzen(result.zustand);
      if (result.brauchtBestaetigung !== undefined) {
        setBrauchtBestaetigung(result.brauchtBestaetigung);
      }

      if (!result.geaendert) {
        // Die Seite war veraltet — nichts geändert, nur den echten Stand
        // nennen, ohne einen Grund zu behaupten, den wir nicht kennen.
        zeigeHinweis(
          result.zustand === "folgt"
            ? "Stand aktualisiert: Du folgst."
            : result.zustand === "angefragt"
              ? "Stand aktualisiert: Deine Anfrage ist gestellt."
              : "Stand aktualisiert: Du folgst nicht.",
        );
        return;
      }

      if (angezeigt === "folgt") {
        // Rückgängig nur, wo erneutes Folgen wirklich wieder folgt: bei einem
        // Profil mit Bestätigung würde daraus eine neue Anfrage.
        if (result.brauchtBestaetigung) {
          zeigeHinweis("Nicht mehr gefolgt. Erneut folgen braucht eine neue Anfrage.");
        } else {
          zeigeHinweis("Nicht mehr gefolgt.", {
            label: "Rückgängig",
            ausfuehren: () => {
              if (zustandRef.current === "keiner") umschalten();
            },
          });
        }
      } else if (angezeigt === "angefragt") {
        zeigeHinweis("Anfrage zurückgezogen.");
      } else if (result.zustand === "angefragt") {
        zeigeHinweis("Anfrage gesendet. Du folgst, sobald sie angenommen ist. Erneut tippen zieht sie zurück.");
      }
    });
  }

  const Icon = zustand === "folgt" ? UserCheck : zustand === "angefragt" ? Clock : UserPlus;

  return (
    // Kein aria-pressed: die Beschriftung wechselt ohnehin mit dem Zustand,
    // "Folgst du, gedrückt" sagte dasselbe doppelt — und "angefragt" ist
    // kein gedrückter Zustand.
    <button
      type="button"
      onClick={tippen}
      disabled={pending}
      className={buttonVariants({
        variant: rueckfrage ? "danger" : zustand === "keiner" ? "accent" : "secondary",
        size: "sm",
      })}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {/* "Folgst du" statt "Gefolgt": dasselbe Wort stand eine Zeile höher
          als Zähler ("4 Gefolgt" — wem diese Person folgt). Direkt daneben
          meinte es auf dem Knopf das Gegenteil, nämlich dass DU folgst. */}
      {rueckfrage
        ? "Wirklich entfolgen?"
        : zustand === "folgt"
          ? "Folgst du"
          : zustand === "angefragt"
            ? "Angefragt"
            : brauchtBestaetigung
              ? "Folgen anfragen"
              : "Folgen"}
    </button>
  );
}
