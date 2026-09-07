"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { removeCompletionPhoto } from "@/lib/actions/completions";
import type { CompletionPhotoItem } from "@/lib/completions";

// Fotos-Sektion der Fahrt-Detailseite (app/fahrten/[id]/page.tsx), ersetzt
// CompletionPhoto.tsx (ein einzelnes Foto) — ab 0036_completion_photos.sql
// kann eine Fahrt mehrere Fotos haben. Gleiches Grid+Lightbox-Muster wie
// PhotoGallery.tsx (Streckenseite), zusätzlich mit Entfernen-Button pro Foto
// für den Besitzer. "Foto von {name}"-Bildunterschrift signalisiert, dass es
// sich um ein selbst hochgeladenes Foto handelt (nicht das Strecken-Cover).
export default function CompletionPhotoGallery({
  photos,
  canRemove,
  displayName,
}: {
  photos: CompletionPhotoItem[];
  canRemove: boolean;
  displayName: string | null;
}) {
  // Nur die entfernten IDs vorhalten statt einer eigenen Kopie von `photos`
  // — bleibt dadurch automatisch konsistent, falls der Server-Component-
  // Elternteil nach einem revalidatePath mit einer neuen `photos`-Prop
  // re-rendert (eine volle useState(photos)-Kopie würde das ignorieren).
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const items = photos.filter((p) => !removedIds.has(p.id));
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const close = useCallback(() => setOpenIndex(null), []);
  const showPrev = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i - 1 + items.length) % items.length)),
    [items.length],
  );
  const showNext = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i + 1) % items.length)),
    [items.length],
  );

  // Nur noch die Pfeiltasten-Navigation zwischen Fotos — Galerie-spezifisch
  // und kein Teil der generischen Dialog-API. Escape zum Schliessen,
  // Fokus-Trap/-Rückgabe und Scroll-Sperre liefert das native <dialog> in
  // Dialog.tsx bereits kostenlos, siehe dort.
  useEffect(() => {
    if (openIndex === null) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") showPrev();
      if (e.key === "ArrowRight") showNext();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIndex, showPrev, showNext]);

  // Nur wenn die Fahrt selbst nie Fotos hatte nichts rendern — nicht wenn
  // `items` durch eine optimistische Entfernung vorübergehend leer ist,
  // sonst verschwindet mit der Section auch eine anschliessende Fehlermeldung.
  if (photos.length === 0) return null;

  function handleRemove(photoId: string) {
    setRemovedIds((prev) => new Set(prev).add(photoId));
    setOpenIndex(null);
    startTransition(async () => {
      const result = await removeCompletionPhoto(photoId);
      if (result.error) {
        // Rückgängig machen, sonst zeigt die UI ein gelöschtes Foto weiter
        // als entfernt an, obwohl es serverseitig unverändert bestehen blieb.
        setRemovedIds((prev) => {
          const next = new Set(prev);
          next.delete(photoId);
          return next;
        });
        setError(result.error);
      }
    });
  }

  const openPhoto = openIndex !== null ? items[openIndex] : null;
  const caption = `Foto von ${displayName ?? "Nutzer"}`;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
        Fotos ({items.length})
      </h2>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-3 gap-1">
        {items.map((photo, i) => (
          <div key={photo.id} className="relative aspect-square overflow-hidden rounded-md">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              title={caption}
              className="absolute inset-0"
            >
              <Image src={photo.fotoUrl} alt={caption} fill sizes="33vw" className="object-cover" />
            </button>
            {canRemove && (
              <button
                type="button"
                onClick={() => handleRemove(photo.id)}
                aria-label="Foto entfernen"
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background backdrop-blur transition-colors duration-fast hover:bg-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Dialog bleibt immer im Baum (wie bei den übrigen Dialog.tsx-Nutzern),
          nur der Inhalt hängt von openPhoto ab — showModal()/close() steuert
          Dialog.tsx selbst über die open-Prop, inkl. Fokus-Trap und Escape. */}
      <Dialog open={openIndex !== null} onClose={close} ariaLabel="Fotoansicht">
        {openPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/90 p-4"
            onClick={close}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Schliessen"
              className="absolute top-4 right-4 border border-background/40 bg-transparent px-3 py-1.5 text-sm text-background hover:bg-background hover:text-foreground"
            >
              Schliessen
            </button>

            {items.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showPrev();
                  }}
                  aria-label="Vorheriges Foto"
                  className="absolute top-1/2 left-4 -translate-y-1/2 border border-background/40 bg-transparent px-3 py-2 text-lg text-background hover:bg-background hover:text-foreground"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showNext();
                  }}
                  aria-label="Nächstes Foto"
                  className="absolute top-1/2 right-4 -translate-y-1/2 border border-background/40 bg-transparent px-3 py-2 text-lg text-background hover:bg-background hover:text-foreground"
                >
                  ›
                </button>
              </>
            )}

            <figure className="flex max-h-full max-w-full flex-col items-center gap-2">
              {/* next/image statt <img>: Die Thumbnails oben laufen bereits
                  darüber, die Lightbox lud dagegen die unbearbeitete
                  Originaldatei — bis 8 MB, so viel lässt
                  logTrackedCompletion() pro Foto zu. Ein Klick auf ein
                  Vorschaubild zog damit im Zweifel mehr nach als die
                  gesamte übrige Seite.

                  sizes="90vw" passt zu max-w-[90vw]; width/height sind nur
                  das Seitenverhältnis für den Optimizer, die tatsächliche
                  Grösse macht object-contain. */}
              <Image
                src={openPhoto.fotoUrl}
                alt={caption}
                width={1600}
                height={1200}
                sizes="90vw"
                className="max-h-[80vh] w-auto max-w-[90vw] object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <figcaption className="text-sm text-background/70">
                {caption}
                {items.length > 1 && ` · ${openIndex! + 1}/${items.length}`}
              </figcaption>
            </figure>
          </div>
        )}
      </Dialog>
    </section>
  );
}
