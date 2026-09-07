"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Dialog } from "@/components/ui/Dialog";
import type { RoutePhoto } from "@/types/database";

export default function PhotoGallery({ photos }: { photos: RoutePhoto[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const showPrev = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length)),
    [photos.length],
  );
  const showNext = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i + 1) % photos.length)),
    [photos.length],
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

  const openPhoto = openIndex !== null ? photos[openIndex] : null;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
        Fotos {photos.length > 0 && `(${photos.length})`}
      </h2>
      {photos.length === 0 ? (
        <p className="text-sm text-muted">
          Noch keine Fotos — beim Abschluss einer Fahrt kannst du welche hinzufügen.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setOpenIndex(i)}
              className="relative aspect-square overflow-hidden rounded-md bg-foreground/5"
              title={photo.display_name ?? undefined}
            >
              <Image
                src={photo.foto_url}
                alt={`Foto von ${photo.display_name ?? "einem Fahrer"}`}
                fill
                sizes="33vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

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
              className="absolute right-4 top-4 border border-background/40 bg-transparent px-3 py-1.5 text-sm text-background hover:bg-background hover:text-foreground"
            >
              Schliessen
            </button>

            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showPrev();
                  }}
                  aria-label="Vorheriges Foto"
                  className="absolute left-4 top-1/2 -translate-y-1/2 border border-background/40 bg-transparent px-3 py-2 text-lg text-background hover:bg-background hover:text-foreground"
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
                  className="absolute right-4 top-1/2 -translate-y-1/2 border border-background/40 bg-transparent px-3 py-2 text-lg text-background hover:bg-background hover:text-foreground"
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
                src={openPhoto.foto_url}
                alt={`Foto von ${openPhoto.display_name ?? "einem Fahrer"}`}
                width={1600}
                height={1200}
                sizes="90vw"
                className="max-h-[80vh] w-auto max-w-[90vw] object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <figcaption className="text-sm text-background/70">
                {openPhoto.display_name ?? "Anonym"}
                {photos.length > 1 && ` · ${openIndex! + 1}/${photos.length}`}
              </figcaption>
            </figure>
          </div>
        )}
      </Dialog>
    </section>
  );
}
