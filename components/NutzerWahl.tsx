"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Avatar from "@/components/Avatar";
import { Input } from "@/components/ui/Input";
import {
  searchProfiles,
  type ProfileSearchResult,
} from "@/lib/actions/profile";

const DEBOUNCE_MS = 250;

// Ein getippter, aber nicht ausgewählter Name ist kein "niemand".
//
// Das Feld schickt immer einen Wert mit, und leer heisst in der Server
// Action ausdrücklich "Zuweisung entfernen". Wer einen Namen eintippt und
// die Liste ignoriert, meint aber das Gegenteil. Dieser Platzhalter ist
// absichtlich keine UUID: creatorUserIdAus() in lib/actions/creatorLinks.ts
// stuft alles Nicht-Leere, das keine UUID ist, als kaputtes Formular ein und
// antwortet mit einem Fehler, statt still zu entfernen. Der Hinweis unten im
// Feld sagt dasselbe schon vorher.
const AUSWAHL_OFFEN = "auswahl-offen";

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
  const [gewaehlt, setGewaehlt] = useState<{
    id: string;
    name: string | null;
  } | null>(gewaehltId ? { id: gewaehltId, name: gewaehltName } : null);
  const [query, setQuery] = useState("");
  // Die Ergebnisse tragen die Anfrage, zu der sie gehören. Ohne das kann eine
  // langsamere frühere Suche eine schnellere spätere überschreiben — und seit
  // die Eingabetaste den ersten Treffer auswählt, wäre das nicht mehr bloss
  // eine veraltete Liste, sondern die stille Zuweisung des falschen Kontos.
  const [treffer, setTreffer] = useState<{
    fuer: string;
    liste: ProfileSearchResult[];
  }>({ fuer: "", liste: [] });
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const sucheRef = useRef<HTMLInputElement>(null);
  const aendernRef = useRef<HTMLButtonElement>(null);
  // Nach einem Wechsel den Fokus dorthin setzen, wo weitergearbeitet wird —
  // sonst fällt er beim Aus- und Einblenden der Zweige auf <body> zurück und
  // die Tastaturbedienung fängt jedes Mal am Seitenanfang wieder an.
  const fokusZiel = useRef<"suche" | "aendern" | null>(null);
  const listenId = useId();

  useEffect(() => {
    const trimmed = query.trim();
    const timeout = setTimeout(() => {
      if (trimmed.length < 2) {
        setTreffer({ fuer: "", liste: [] });
        setOpen(false);
        return;
      }
      startTransition(async () => {
        const found = await searchProfiles(trimmed);
        setTreffer({ fuer: trimmed, liste: found });
        setOpen(true);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (fokusZiel.current === "suche") sucheRef.current?.focus();
    else if (fokusZiel.current === "aendern") aendernRef.current?.focus();
    fokusZiel.current = null;
  }, [gewaehlt]);

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

  function waehle(profil: ProfileSearchResult) {
    fokusZiel.current = "aendern";
    setGewaehlt({ id: profil.id, name: profil.displayName });
    setOpen(false);
  }

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
            ref={aendernRef}
            type="button"
            onClick={() => {
              fokusZiel.current = "suche";
              setGewaehlt(null);
              setQuery("");
            }}
            className="shrink-0 text-xs font-medium text-muted underline underline-offset-2 hover:text-foreground"
          >
            Ändern
          </button>
        </div>
        <input type="hidden" name={name} value={gewaehlt.id} />
        {hinweis && (
          <span className="text-xs font-normal text-muted">{hinweis}</span>
        )}
      </div>
    );
  }

  const getippt = query.trim().length > 0;
  // Erst wenn die Antwort zur aktuellen Eingabe gehört, darf sie ausgewählt
  // werden — während des Tippens steht sonst noch die Liste der vorigen
  // Anfrage da.
  const aktuell = treffer.fuer === query.trim() && treffer.fuer.length > 0;
  const results = aktuell ? treffer.liste : [];

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col gap-1.5 text-sm font-medium"
    >
      <label className="flex flex-col gap-1.5">
        {label}
        <Input
          ref={sucheRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key !== "Enter") return;
            // Ohne das hier verschickt die Eingabetaste das ganze Formular:
            // ein Textfeld plus Absenden-Knopf löst die implizite Absendung
            // aus. Da das versteckte Feld dann leer mitginge, nähme ein
            // beherzter Enter einem Creator still seine Zuweisung weg.
            event.preventDefault();
            if (open && aktuell && results.length > 0) waehle(results[0]);
          }}
          placeholder="Name eingeben…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listenId}
          aria-autocomplete="list"
        />
      </label>
      {/* Leer mitschicken heisst "keiner" — die Server Action unterscheidet
          das ausdrücklich von einem kaputten Wert. Ein getippter, aber nicht
          gewählter Name ist kein "keiner", siehe AUSWAHL_OFFEN oben. */}
      <input type="hidden" name={name} value={getippt ? AUSWAHL_OFFEN : ""} />
      {getippt && (
        <span className="text-xs font-normal text-warning">
          Bitte ein Konto aus der Liste wählen — oder das Feld leeren, um die
          Zuweisung zu entfernen.
        </span>
      )}
      {hinweis && (
        <span className="text-xs font-normal text-muted">{hinweis}</span>
      )}

      {open && (
        <ul
          id={listenId}
          role="listbox"
          aria-label="Gefundene Konten"
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto overscroll-y-contain rounded-lg border border-border bg-background shadow-elevated"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm font-normal text-muted">
              {isPending || !aktuell ? "Wird gesucht…" : "Kein Konto gefunden."}
            </li>
          ) : (
            results.map((profil) => (
              <li key={profil.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => waehle(profil)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal hover:bg-surface druckbar"
                >
                  <Avatar
                    url={profil.avatarUrl}
                    name={profil.displayName}
                    size={24}
                  />
                  <span className="min-w-0 truncate">{profil.displayName}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {/* Die Ergebniszahl ansagen: die Liste erscheint sonst lautlos, und wer
          sie nicht sieht, erfährt nicht, dass es jetzt etwas zu tabben gibt. */}
      <span aria-live="polite" className="sr-only">
        {open
          ? isPending
            ? "Wird gesucht…"
            : `${results.length} Konten gefunden.`
          : ""}
      </span>
    </div>
  );
}
