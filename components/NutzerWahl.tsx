"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Avatar from "@/components/Avatar";
import { Input } from "@/components/ui/Input";
import { searchProfiles, type ProfileSearchResult } from "@/lib/actions/profile";

const DEBOUNCE_MS = 250;

// Ein Konto auswählen und seine ID in einem versteckten Feld ablegen.
//
// Nicht ProfileSearch.tsx erweitert, obwohl es dieselbe Abfrage benutzt
// (searchProfiles, Kernregel 14 gilt für die Abfrage und wird eingehalten):
// ProfileSearch ist ein Navigationswidget — jedes Ergebnis ist ein <Link>
// auf ein Profil. Daraus wahlweise ein Formularfeld zu machen hiesse, zwei
// unvereinbare Verhalten in eine Komponente zu schalten, und die wird auf
// jeder Profilseite gerendert. Hier steht stattdessen dieselbe Suche mit
// dem einen Unterschied, der zählt: ein Ergebnis ist ein <button>, der
// auswählt statt zu navigieren.
export default function NutzerWahl({
  name,
  gewaehltId = null,
  gewaehltName = null,
  label = "Creator-Konto",
  hinweis,
}: {
  /** Feldname des versteckten Inputs, unter dem die ID abgeschickt wird. */
  name: string;
  gewaehltId?: string | null;
  gewaehltName?: string | null;
  label?: ReactNode;
  hinweis?: string;
}) {
  const [gewaehlt, setGewaehlt] = useState<{ id: string; name: string | null } | null>(
    gewaehltId ? { id: gewaehltId, name: gewaehltName } : null,
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const timeout = setTimeout(() => {
      if (trimmed.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      startTransition(async () => {
        const found = await searchProfiles(trimmed);
        setResults(found);
        setOpen(true);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  // Schliesst die Ergebnisliste bei Klick ausserhalb — dieselbe Interaktion
  // wie in ProfileSearch.tsx.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  if (gewaehlt) {
    return (
      <div className="flex flex-col gap-1.5 text-sm font-medium">
        {label}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
          <span className="min-w-0 truncate font-normal">
            {/* Ein gelöschtes Konto trägt keinen Namen mehr (0058) — dann
                steht hier die Tatsache statt eines erfundenen Platzhalters. */}
            {gewaehlt.name ?? "Konto ohne Namen"}
          </span>
          <button
            type="button"
            onClick={() => {
              setGewaehlt(null);
              setQuery("");
            }}
            className="shrink-0 text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
          >
            Ändern
          </button>
        </div>
        <input type="hidden" name={name} value={gewaehlt.id} />
        {hinweis && <span className="text-xs font-normal text-muted">{hinweis}</span>}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5 text-sm font-medium">
      <label className="flex flex-col gap-1.5">
        {label}
        <Input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name eingeben…"
          autoComplete="off"
        />
      </label>
      {/* Leer mitschicken heisst "keiner" — die Server Action unterscheidet
          das ausdrücklich von einem kaputten Wert. */}
      <input type="hidden" name={name} value="" />
      {hinweis && <span className="text-xs font-normal text-muted">{hinweis}</span>}

      {open && (
        <ul className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-background shadow-elevated">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm font-normal text-muted">
              {isPending ? "Wird gesucht…" : "Kein Konto gefunden."}
            </li>
          ) : (
            results.map((profil) => (
              <li key={profil.id}>
                <button
                  type="button"
                  onClick={() => {
                    setGewaehlt({ id: profil.id, name: profil.displayName });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal hover:bg-surface"
                >
                  <Avatar url={profil.avatarUrl} name={profil.displayName} size={24} />
                  <span className="min-w-0 truncate">{profil.displayName}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
