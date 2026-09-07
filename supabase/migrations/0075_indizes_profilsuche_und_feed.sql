-- =====================================================================
-- Indizes für die Profilsuche und den Feed.
--
-- Befund aus docs/audit/2026-09-07-followup.md, Abschnitt Datenbank.
--
-- A) Profilsuche. lib/actions/profile.ts sucht mit
--    ilike '%<eingabe>%' auf profiles.display_name — bei jedem
--    Tastendruck, ohne Index. Ein B-Tree hilft hier prinzipiell nicht:
--    ein führendes % macht ihn unbenutzbar. pg_trgm mit GIN ist der
--    Indextyp, der genau diesen Fall abdeckt.
--
--    Der Teilindex spart die Zeilen ohne Namen — die Query filtert
--    ohnehin auf "display_name is not null", das Prädikat passt also
--    exakt.
--
-- B) Feed. lib/feed.ts liest public_fahrten mit
--    order by datum desc limit 30. Der Index deckt genau die
--    öffentlichen Fahrten ab, und id als zweite Spalte macht die
--    Sortierung eindeutig — ohne sie ist die Reihenfolge bei gleichem
--    Datum nicht definiert, was beim Blättern Zeilen doppelt oder gar
--    nicht zeigt.
--
--    Damit der Index vollständig greift, muss die Abfrage in
--    lib/feed.ts zusätzlich nach id sortieren:
--
--      .order("datum", { ascending: false })
--      .order("id", { ascending: false })
--
--    Das ist eine App-Änderung und gehört nicht in diese Migration.
--    Der Index ist auch ohne sie nützlich, nur eben nicht als
--    vollständige Sortierquelle.
--
-- pg_trgm liegt bewusst in extensions, nicht in public: Supabase legt
-- Erweiterungen dort ab, und ein Objekt im public-Schema wäre über
-- PostgREST sichtbar.
--
-- Risiko: CREATE INDEX ohne CONCURRENTLY sperrt die Tabelle für
-- Schreibvorgänge. Bei der heutigen Datenmenge (die Migrations-README
-- hält für den 0063-Batch 0 Abos, 0 private Strecken, 0 Premium-Konten
-- fest) sind das Sekundenbruchteile. Bei nennenswertem Bestand
-- stattdessen CONCURRENTLY ausserhalb einer Transaktion fahren — das
-- geht in einer Migration nicht.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_display_name_trgm_idx
  on public.profiles
  using gin (display_name extensions.gin_trgm_ops)
  where display_name is not null;

comment on index public.profiles_display_name_trgm_idx is
  'Trigramm-Index fuer die Namenssuche (searchProfiles, lib/actions/profile.ts). Ein B-Tree hilft dort nicht: ilike ''%x%'' mit fuehrendem Prozentzeichen kann ihn nicht nutzen. Teilindex analog zum "display_name is not null"-Filter der Query (0075).';

create index if not exists route_completions_oeffentlich_datum_idx
  on public.route_completions (datum desc, id desc)
  where ist_oeffentlich = true;

comment on index public.route_completions_oeffentlich_datum_idx is
  'Deckt die Feed-Abfrage (lib/feed.ts, order by datum desc limit 30) ab. id als zweite Spalte macht die Sortierung eindeutig — sonst ist die Reihenfolge bei gleichem Datum undefiniert und das Blaettern zeigt Zeilen doppelt oder gar nicht. Voll wirksam erst, wenn die Abfrage ebenfalls nach id sortiert (0075).';
