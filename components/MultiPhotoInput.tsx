"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "@/components/NavIcons";
import { ladeFotosDirektHoch, loescheDirektUpload } from "@/lib/fotoUpload";
import { meldeClientFehler } from "@/lib/fehlerbericht";

const MAX_FOTO_BYTES = 8 * 1024 * 1024;

// Lange Kante nach dem Verkleinern: 1920 px reichen für Galerie und
// Teilen-Bild, halbieren aber typische Handy-Fotos (4000+ px) in der
// Dateigrösse. Das Canvas-Neuzeichnen entfernt nebenbei EXIF
// (Standort, Gerät) bereits im Browser — der Server streift den Rest
// weiterhin in lib/actions/completions.ts.
const MAX_KANTE_PX = 1920;
const JPEG_QUALITAET = 0.82;

function ladeBild(datei: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild nicht lesbar"));
    };
    img.src = url;
  });
}

// Verkleinert grosse Fotos im Browser, damit der 9-MB-Server-Action-Body
// (next.config.ts) und die 8-MB-Dateigrenze seltener greifen. Kleine Bilder
// und nicht darstellbare Dateien kommen unverändert zurück — kein
// stilles Abweisen, der Server bleibt die Schranke.
async function verkleinereFoto(datei: File): Promise<File> {
  if (datei.size <= 2 * 1024 * 1024) return datei;
  if (!datei.type.startsWith("image/")) return datei;
  try {
    const img = await ladeBild(datei);
    const groesste = Math.max(img.naturalWidth, img.naturalHeight);
    if (groesste <= MAX_KANTE_PX) return datei;
    const faktor = MAX_KANTE_PX / groesste;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * faktor);
    canvas.height = Math.round(img.naturalHeight * faktor);
    const ctx = canvas.getContext("2d");
    if (!ctx) return datei;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITAET),
    );
    if (!blob || blob.size >= datei.size) return datei;
    return new File([blob], datei.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return datei;
  }
}

interface PhotoEntry {
  file: File;
  preview: string;
  // Storage-Pfad nach Direkt-Upload (lib/fotoUpload.ts). Gesetzt heisst: die
  // Bytes liegen bereits im Bucket, das Formular schickt nur diesen Pfad als
  // "foto_pfade" mit — die Datei selbst wird NICHT in den Datei-Input
  // gehängt. Fehlt er (Upload gescheitert, abgemeldet), läuft die Datei den
  // klassischen Weg durch die Server Action.
  pfad?: string;
  // Während der Direkt-Upload läuft, ist die Vorschau sichtbar, aber noch
  // nicht speicherbar — das Formular darf in der Zeit nicht abgeschickt
  // werden (RideSummaryForm sperrt über pending ohnehin, dies ist die
  // Anzeige dazu).
  lädtHoch?: boolean;
}

// Mehrfach-Variante von PhotoInput.tsx (früher: genau ein Foto pro Fahrt) —
// hängt ausgewählte Dateien in einem versteckten <input multiple> unter
// demselben Feldnamen an, FormData.getAll(name) liefert beim Absenden alle
// zurück (logTrackedCompletion, lib/actions/completions.ts). Serverseitig
// zusätzlich begrenzt (maxFotosProFahrt in lib/premium.ts, angewendet in
// lib/actions/completions.ts) — diese Clientgrenze ist nur UX, keine
// Durchsetzung. Wer das Formular selbst zusammenbaut, schickt so viele
// Dateien, wie er will; abgeschnitten wird im Server.
export default function MultiPhotoInput({
  name,
  id,
  maxPhotos,
}: {
  name: string;
  id: string;
  maxPhotos: number;
}) {
  const [entries, setEntries] = useState<PhotoEntry[]>([]);
  const [sizeError, setSizeError] = useState(false);
  const [limitError, setLimitError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Immer aktuell gehalten, damit die Unmount-Cleanup unten die zuletzt
  // gültigen Previews sieht statt des leeren Anfangswerts, über den ein
  // Effekt ohne Dependency sonst geschlossen bliebe. Das Aktualisieren
  // selbst passiert in einem eigenen Effekt statt während des Renders
  // (Refs während des Renders zu schreiben ist unzulässig).
  const entriesRef = useRef<PhotoEntry[]>([]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Object-URLs statt FileReader.readAsDataURL(): siehe PhotoInput.tsx für
  // die Begründung (spürbares Hängen auf Mobilgeräten bei grossen Base64-
  // Strings). Müssen beim Unmount wieder freigegeben werden.
  useEffect(() => {
    return () => {
      for (const entry of entriesRef.current) URL.revokeObjectURL(entry.preview);
    };
  }, []);

  function syncInputFiles(next: PhotoEntry[]) {
    // Nur Dateien OHNE Direkt-Upload-Pfad: Bereits hochgeladene laufen über
    // das versteckte foto_pfade-Feld unten, nicht mehr durch den Body.
    const dt = new DataTransfer();
    for (const entry of next) if (!entry.pfad) dt.items.add(entry.file);
    if (inputRef.current) inputRef.current.files = dt.files;
  }

  // React 19 setzt ein <form action={…}> nach jedem Lauf der Action zurück —
  // auch nach einem Fehlschlag, und auch dann, wenn die Seite stehen bleibt
  // (react-dom ruft dafür form.reset() auf). Für die Vorschauen hier ist das
  // unsichtbar: die liegen in React-State und überleben. input.files liegt
  // dagegen im DOM und ist danach LEER.
  //
  // Der Fazit-Screen zeigt nach einem gescheiterten Speichern also weiter n
  // Fotos an, während ein zweiter Tap auf "Fahrt speichern" null Fotos
  // mitschickt — stiller Datenverlust genau in dem Moment, in dem der Nutzer
  // es noch einmal versucht. Deshalb nach dem Reset wieder auffüllen.
  //
  // Der reset-Event feuert VOR dem eigentlichen Zurücksetzen (HTML-Standard),
  // die Zuweisung muss also einen Tick später laufen. entriesRef statt
  // entries, damit der einmal registrierte Listener nicht über den
  // Anfangswert geschlossen bleibt.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) {
      // Ohne umgebendes <form> greift die Wiederherstellung still nicht —
      // und der Ausfall sähe genau aus wie der Fehler, den sie behebt:
      // Vorschauen sichtbar, null Dateien abgeschickt. Ein Effekt ohne
      // Dependencies merkt einen später eingehängten Input nicht, deshalb
      // hier wenigstens laut sein. Heute unerreichbar (die einzige
      // Verwendung steht in RideSummaryForm innerhalb des Formulars).
      console.warn(
        "MultiPhotoInput steht ausserhalb eines <form> — ausgewählte Fotos gehen nach einem fehlgeschlagenen Absenden verloren.",
      );
      return;
    }

    function handleReset() {
      queueMicrotask(() => syncInputFiles(entriesRef.current));
    }

    form.addEventListener("reset", handleReset);
    return () => form.removeEventListener("reset", handleReset);
  }, []);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    // Input sofort leeren: Der weitere Ablauf ist asynchron (verkleinern,
    // Direkt-Upload), und dieselbe Datei soll danach erneut wählbar sein.
    e.target.value = "";

    // Erst verkleinern, dann prüfen: Ein 12-MP-Handyfoto passt danach meist
    // unter die 8-MB-Grenze, statt abgewiesen zu werden.
    const verkleinert = await Promise.all(files.map(verkleinereFoto));
    const oversized = verkleinert.some((f) => f.size > MAX_FOTO_BYTES);
    setSizeError(oversized);
    const accepted = verkleinert
      .filter((f) => f.size <= MAX_FOTO_BYTES)
      .map((file) => ({ file, preview: URL.createObjectURL(file), lädtHoch: true }));

    // Sofort anzeigen (mit Ladezustand), dann im Hintergrund direkt
    // hochladen. Misslingt der Direkt-Upload (abgemeldet, offline, Bucket
    // zu), bleibt die Datei als klassischer Formular-Upload erhalten —
    // kein stiller Verlust der Auswahl.
    const platzFrei = Math.max(maxPhotos - entriesRef.current.length, 0);
    const sichtbar = accepted.slice(0, platzFrei);
    for (const dropped of accepted.slice(platzFrei)) URL.revokeObjectURL(dropped.preview);
    setLimitError(accepted.length > platzFrei);
    if (sichtbar.length === 0) return;
    const next0 = [...entriesRef.current, ...sichtbar].slice(0, maxPhotos);
    setEntries(next0);
    syncInputFiles(next0);

    try {
      const pfade = await ladeFotosDirektHoch(sichtbar.map((s) => s.file));
      setEntries((prev) => {
        const next = prev.map((entry) => {
          const idx = sichtbar.findIndex((s) => s.preview === entry.preview);
          if (idx === -1) return entry;
          return { ...entry, pfad: pfade[idx], lädtHoch: false };
        });
        syncInputFiles(next);
        return next;
      });
    } catch (fehler) {
      meldeClientFehler(fehler, "foto-direkt-upload");
      // Fallback: Dateien bleiben als klassischer Upload im Datei-Input.
      setEntries((prev) => {
        const next = prev.map((entry) =>
          sichtbar.some((s) => s.preview === entry.preview)
            ? { ...entry, lädtHoch: false }
            : entry,
        );
        syncInputFiles(next);
        return next;
      });
    }
  }

  function removeAt(index: number) {
    const entfernt = entriesRef.current[index];
    if (entfernt?.pfad) void loescheDirektUpload(entfernt.pfad);
    setEntries((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      const next = prev.filter((_, i) => i !== index);
      syncInputFiles(next);
      return next;
    });
  }

  // Hochgeladene Pfade für die Server Action (lib/actions/completions.ts,
  // Feld "foto_pfade"). Als JSON im versteckten Feld — React rendert es aus
  // dem State, ein Formular-Reset löscht es also nicht wie input.files.
  const fotoPfade = entries.filter((e) => e.pfad).map((e) => e.pfad as string);
  const lädtHoch = entries.some((e) => e.lädtHoch);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-baseline justify-between">
        <span>Fotos (optional)</span>
        {entries.length > 0 && (
          <span className="text-xs tabular-nums text-muted">
            {entries.length}/{maxPhotos}
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        name={name}
        accept="image/*"
        multiple
        onChange={handleChange}
        className="sr-only"
      />
      <input type="hidden" name="foto_pfade" value={JSON.stringify(fotoPfade)} />
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {entries.map((entry, i) => (
            <div key={entry.preview} className="relative aspect-square overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.preview}
                alt=""
                className={`h-full w-full object-cover ${entry.lädtHoch ? "opacity-50" : ""}`}
              />
              {entry.lädtHoch && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 m-auto h-5 w-5 animate-spin rounded-full border-2 border-background/40 border-t-background"
                />
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Foto entfernen"
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background backdrop-blur transition-colors duration-fast hover:bg-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {entries.length < maxPhotos && (
        <label
          htmlFor={id}
          className="cursor-pointer rounded-md border border-dashed border-border px-3 py-3 text-center text-muted transition-colors duration-fast hover:border-border-strong hover:text-foreground"
        >
          + Foto hinzufügen
        </label>
      )}
      {sizeError && <span className="text-xs text-danger">Ein Foto ist zu gross (max. 8 MB).</span>}
      {limitError && (
        <span className="text-xs text-danger">Maximal {maxPhotos} Fotos pro Fahrt.</span>
      )}
      {lädtHoch && (
        <span role="status" className="text-xs text-muted">
          Fotos werden hochgeladen …
        </span>
      )}
    </div>
  );
}
