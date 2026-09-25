"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import { Lock, Users } from "@/components/NavIcons";
import type { FollowProfile } from "@/lib/follows";
import { followerEntfernen } from "@/lib/actions/follows";
import { buttonVariants } from "@/components/ui/Button";

// Popup für die Follower/Following-Zahlen auf Profilseiten (eigenes und
// fremde öffentliche) — Dialog.tsx gibt Fokus-Trap, Escape und
// Klick-ausserhalb-schliesst bereits kostenlos (natives <dialog>).
export default function FollowListModal({
  open,
  onClose,
  title,
  profiles,
  hidden = false,
  entfernbar = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  profiles: FollowProfile[];
  // true wenn der Profil-Besitzer zeigt_follower_liste ausgeschaltet hat und
  // dieser Betrachter nicht der Besitzer selbst ist — profiles ist dann
  // ohnehin leer (die aufrufende Seite lädt die echten Daten für Dritte gar
  // nicht erst), zeigt aber eine erklärende Meldung statt "Noch niemand.",
  // damit niemand fälschlich denkt, es folge wirklich niemand.
  hidden?: boolean;
  // Nur in der eigenen Follower-Liste (0149): jeder Eintrag bekommt
  // "Entfernen". Wichtig für Fahrten "nur für Follower" — wer vor den
  // Folgeanfragen gefolgt ist, wurde nie bestätigt.
  entfernbar?: boolean;
}) {
  // Wie FolgeanfragenListe: die Liste kommt aus den Props, lokal gemerkt
  // wird nur, wer gerade entfernt wurde.
  const [entfernt, setEntfernt] = useState<ReadonlySet<string>>(new Set());
  // Entfernen in zwei Schritten: rückgängig machen lässt es sich nicht —
  // mit Bestätigung (0146) müsste die Person neu anfragen.
  const [rueckfrage, setRueckfrage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const liste = profiles.filter((p) => !entfernt.has(p.id));
  // Rückmeldung IM Dialog statt als Hinweis-Toast: der Toast liegt nicht im
  // Top-Layer und verschwände hinter dem offenen <dialog>.
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);
  // Nach "Abbrechen" soll der Fokus auf dem Entfernen-Knopf derselben Zeile
  // landen, nach dem Entfernen auf der Rückmeldung — beide Male verschwindet
  // der gerade fokussierte Knopf aus dem Dokument.
  const [fokusZurueck, setFokusZurueck] = useState<string | null>(null);
  const meldungRef = useRef<HTMLParagraphElement>(null);

  function schliessen() {
    setMeldung(null);
    setRueckfrage(null);
    onClose();
  }

  function entfernen(profile: FollowProfile) {
    setRueckfrage(null);
    setMeldung(null);
    meldungRef.current?.focus();
    setEntfernt((s) => new Set(s).add(profile.id));
    startTransition(async () => {
      const { ok } = await followerEntfernen(profile.id);
      if (!ok) {
        setEntfernt((s) => {
          const neu = new Set(s);
          neu.delete(profile.id);
          return neu;
        });
        setMeldung({ text: "Das hat nicht geklappt. Bitte versuche es noch einmal.", fehler: true });
        return;
      }
      setMeldung({ text: `${profile.displayName ?? "Die Person"} folgt dir nicht mehr.`, fehler: false });
    });
  }

  return (
    <Dialog open={open} onClose={schliessen} title={title} className="max-h-[70dvh] overflow-y-auto overscroll-y-contain">
      {/* role="status" liest die Rückmeldung vor, ohne den Fokus zu ziehen. */}
      <p
        ref={meldungRef}
        tabIndex={-1}
        role="status"
        className={`outline-none ${meldung?.fehler ? "text-sm text-danger" : "text-sm text-muted"}`}
      >
        {meldung?.text}
      </p>
      {hidden ? (
        <EmptyState icon={Lock} title="Diese Liste ist privat." />
      ) : liste.length === 0 ? (
        <EmptyState icon={Users} title="Noch niemand." />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {liste.map((profile) => (
            <li key={profile.id} className="flex items-center gap-2">
              <Link
                href={`/fahrer/${profile.id}`}
                onClick={onClose}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 transition-colors duration-fast hover:text-accent-ink"
              >
                <Avatar url={profile.avatarUrl} name={profile.displayName} size={36} />
                <span className="truncate text-sm font-medium">
                  {profile.displayName ?? "Fahrer"}
                </span>
              </Link>
              {entfernbar &&
                (rueckfrage === profile.id ? (
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRueckfrage(null);
                        setFokusZurueck(profile.id);
                      }}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      // Der erste Knopf verschwindet beim Tippen — ohne das
                      // landete der Tastaturfokus auf <body>.
                      autoFocus
                      disabled={pending}
                      onClick={() => entfernen(profile)}
                      aria-label={`${profile.displayName ?? "Fahrer"} wirklich als Follower entfernen`}
                      className={buttonVariants({ variant: "danger", size: "sm" })}
                    >
                      Entfernen
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setFokusZurueck(null);
                      setRueckfrage(profile.id);
                    }}
                    // Nur direkt nach "Abbrechen" — sonst stähle es beim
                    // Öffnen des Dialogs den Fokus.
                    autoFocus={fokusZurueck === profile.id}
                    aria-label={`${profile.displayName ?? "Fahrer"} als Follower entfernen`}
                    className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}
                  >
                    Entfernen
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
