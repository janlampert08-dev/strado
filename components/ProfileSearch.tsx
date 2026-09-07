"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import Avatar from "@/components/Avatar";
import { Input } from "@/components/ui/Input";
import { searchProfiles, type ProfileSearchResult } from "@/lib/actions/profile";

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
          placeholder="Fahrer suchen…"
          className="pl-9"
        />
      </div>

      {open && (
        <div className="absolute top-full right-0 left-0 z-10 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-elevated">
          {isPending && results.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted">Suche…</p>
          )}
          {!isPending && results.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted">Keine Fahrer gefunden.</p>
          )}
          {results.map((profile) => (
            <Link
              key={profile.id}
              href={`/fahrer/${profile.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-fast hover:bg-surface"
            >
              <Avatar url={profile.avatarUrl} name={profile.displayName} size={28} />
              <span className="truncate font-medium">{profile.displayName ?? "Fahrer"}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
