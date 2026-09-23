"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import Avatar from "@/components/Avatar";
import { Input } from "@/components/ui/Input";
import { searchProfiles, type ProfileSearchResult } from "@/lib/actions/profile";
import { mitAnzahl } from "@/lib/format";

const DEBOUNCE_MS = 250;

// Namenssuche für Nutzerprofile — gleiche Feld-Optik wie die Strecken-Suche
// in ExploreSidebar (fieldClassName über <Input>), hier aber mit
// Server-Action-Abfrage statt reinem Client-Filter über bereits geladene
// Daten, da Profile anders als Strecken nicht vorab auf die Seite geladen
// werden.
export default function ProfileSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  // Tastatur und Screenreader. Vorher war die Liste nur mit der Maus
  // bedienbar: Pfeil nach unten tat nichts, und dass und wie viele Treffer
  // erschienen, sagte niemand an. Jetzt das Combobox-Muster der WAI-ARIA
  // Authoring Practices: Fokus bleibt im Feld, aria-activedescendant zeigt
  // auf den markierten Treffer, Enter öffnet ihn, Escape schliesst.
  const router = useRouter();
  const listId = useId();
  const [aktiv, setAktiv] = useState(-1);

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
        setAktiv(-1);
        setOpen(true);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  // Schliesst das Ergebnis-Dropdown bei Klick ausserhalb — dieselbe
  // Interaktion wie ein natives <select>, ohne dafür ein eigenes
  // Overlay-/Fokus-Trap-System zu bauen (die Ergebnisliste ist kein Dialog).
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && aktiv >= 0 ? `${listId}-${aktiv}` : undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setAktiv(-1);
              return;
            }
            if (!open || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setAktiv((i) => (i + 1) % results.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setAktiv((i) => (i <= 0 ? results.length - 1 : i - 1));
            } else if (event.key === "Enter" && aktiv >= 0) {
              event.preventDefault();
              setOpen(false);
              router.push(`/fahrer/${results[aktiv].id}`);
            }
          }}
          placeholder="Fahrer suchen…"
          aria-label="Fahrer suchen"
          className="pl-9"
        />
      </div>

      {/* Ansage der Trefferzahl — immer im DOM, siehe components/Hinweis.tsx. */}
      <p role="status" className="sr-only">
        {open && !isPending
          ? results.length === 0
            ? "Keine Fahrer gefunden."
            : mitAnzahl(results.length, "Treffer", "Treffer")
          : ""}
      </p>
      {open && (
        // z-30 statt z-10: der Avatar der ersten Feed-Karte (relative z-10)
        // lag sonst über der Trefferliste.
        <div
          id={listId}
          role="listbox"
          aria-label="Gefundene Fahrer"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto overscroll-y-contain rounded-lg border border-border bg-background shadow-elevated"
        >
          {isPending && results.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted">Suche…</p>
          )}
          {!isPending && results.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted">Keine Fahrer gefunden.</p>
          )}
          {results.map((profile, index) => (
            <Link
              key={profile.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === aktiv}
              href={`/fahrer/${profile.id}`}
              onClick={() => setOpen(false)}
              onMouseEnter={() => setAktiv(index)}
              className={`flex min-h-14 items-center gap-3 px-3 py-2 text-sm transition-colors duration-fast hover:bg-surface druckbar ${
                index === aktiv ? "bg-surface" : ""
              }`}
            >
              <Avatar url={profile.avatarUrl} name={profile.displayName} size={36} />
              {/* Zweite Zeile, damit zwei gleichnamige Fahrer unterscheidbar
                  sind: Region, Fahrten, Follower — alles öffentlich, siehe
                  searchProfiles in lib/actions/profile.ts. */}
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{profile.displayName ?? "Fahrer"}</span>
                <span className="truncate text-xs text-muted">
                  {[
                    profile.region,
                    mitAnzahl(profile.fahrten, "Fahrt", "Fahrten"),
                    `${profile.follower} Follower`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
