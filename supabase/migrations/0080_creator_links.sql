-- =====================================================================
-- creator_links — die vergebenen Einstiegscodes für /c/<code>
--
-- Phase 1 hielt die Codes in einer TypeScript-Konstanten
-- (lib/creatorLinks.ts). Das war richtig, solange niemand sie ändern
-- können musste: kein Datenbank-Roundtrip pro Klick, testbar, und ein
-- neuer Creator war ein Ein-Zeilen-PR. Sobald die Codes aber über eine
-- Oberfläche verwaltet werden, wäre "einen Creator anlegen" ein Deploy —
-- deshalb diese Tabelle.
--
-- Was hier NICHT passiert: die Herkunft bis zur Registrierung
-- durchreichen. Das ist Phase 2 aus docs/creator-links-plan.md und
-- braucht Cookie, Trigger und eine Änderung der Datenschutzerklärung.
-- Diese Tabelle ist die Vorbedingung dafür, nicht die Umsetzung.
-- =====================================================================

create table public.creator_links (
  code text primary key,
  -- Wer dahintersteckt. Personenbezogen — siehe die Grants unten, die
  -- diese Spalte bewusst nicht an anon geben.
  name text not null,
  -- Landet als utm_source in der Auswertung.
  kanal text not null,
  -- Optional die Aktion, zu der der Link gehört (utm_campaign).
  kampagne text,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  -- set null statt cascade: ein gelöschtes Moderatorenkonto darf die
  -- vergebenen Links nicht mitreissen. Sie sind draussen im Umlauf.
  erstellt_von uuid references auth.users (id) on delete set null,

  -- Dieselben Muster, die lib/creatorLinks.ts prüft. Die Anwendung ist
  -- die erste Schranke, das hier ist die letzte: ein Code wandert
  -- unverändert in eine URL und in die Auswertung, und ein direkter
  -- PostgREST-Insert eines Moderators (oder ein späteres Skript) läuft
  -- an jeder TypeScript-Prüfung vorbei. Ein Code mit Schrägstrich oder
  -- Leerzeichen wäre von /c/<code> nicht mehr auflösbar.
  constraint creator_links_code_format
    check (code ~ '^[a-z0-9-]{2,32}$'),
  constraint creator_links_name_laenge
    check (char_length(btrim(name)) between 1 and 80),
  constraint creator_links_kanal_format
    check (kanal ~ '^[a-z0-9_-]{2,32}$'),
  constraint creator_links_kampagne_format
    check (kampagne is null or kampagne ~ '^[a-z0-9_-]{2,32}$')
);

comment on table public.creator_links is
  'Vergebene Einstiegscodes fuer /c/<code>. Verwaltet unter /moderation/creator. Aufgeloest wird oeffentlich ueber creator_link_aufloesen(text), nicht ueber diese Tabelle — name ist personenbezogen und wird deshalb nicht an anon gegeben (0080).';

alter table public.creator_links enable row level security;

-- Supabase gibt neuen Tabellen per Default-Privilegien Rechte an anon und
-- authenticated. Erst vollständig entziehen, dann gezielt geben —
-- dieselbe Reihenfolge wie in 0034 für profiles.
revoke all on public.creator_links from anon, authenticated;

-- Nur authenticated bekommt überhaupt Tabellenrechte; die Policy darunter
-- beschränkt das auf Moderatoren. anon bekommt hier nichts: der
-- öffentliche Weg läuft über die Funktion weiter unten.
grant select, insert, update, delete on public.creator_links to authenticated;

-- Eine Policy für alle vier Operationen. WITH CHECK ist ausdrücklich
-- dabei: ohne es verwendet Postgres die USING-Bedingung auch als Check
-- (siehe die ausführliche Begründung in 0071). Hier wäre das folgenlos,
-- weil beide Bedingungen identisch sind und nur den Aufrufer prüfen —
-- aber die Auslassung wäre beim nächsten Mal wieder eine Fehlerquelle.
create policy "Moderatoren verwalten Creator-Links"
  on public.creator_links for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_moderator = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_moderator = true
    )
  );

comment on policy "Moderatoren verwalten Creator-Links" on public.creator_links is
  'Die Liste gehoert der Moderation. Ein normaler eingeloggter Nutzer sieht keine einzige Zeile — das ist die Schranke, die name schuetzt, denn Spalten-Grants koennen Moderatoren nicht von uebrigen authenticated-Nutzern unterscheiden (0080).';

-- =====================================================================
-- creator_link_aufloesen(text) — der öffentliche Weg
--
-- app/c/[code]/route.ts braucht drei Felder, um die Weiterleitung zu
-- bauen, und läuft dabei je nach Besucher als anon ODER als
-- authenticated — die Antwort muss in beiden Fällen dieselbe sein.
--
-- Warum das nicht als Aufrufer geht (AGENTS.md verlangt diese
-- Begründung für jede SECURITY DEFINER-Funktion): die Unterscheidung,
-- die hier nötig ist, verläuft zwischen Spalten, nicht zwischen Zeilen.
-- name ist personenbezogen und darf die Moderationsansicht nicht
-- verlassen; code/kanal/kampagne sind es nicht. Spalten-Rechte vergibt
-- Postgres pro ROLLE — und Moderator wie Normalnutzer sind dieselbe
-- Rolle `authenticated`. Eine Policy, die dem eingeloggten Besucher den
-- aktiven Link zeigt, zeigte ihm damit zwangsläufig auch den Namen.
--
-- Die Funktion gibt genau das preis, was ein Klick ohnehin offenlegt,
-- und nur für einen Code, den der Aufrufer bereits kennt. Sie kann
-- nicht auflisten: ohne p_code kommt keine Zeile zurück. Codes sind
-- öffentlich — sie stehen in TikTok-Captions.
-- =====================================================================

create function public.creator_link_aufloesen(p_code text)
returns table (code text, kanal text, kampagne text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.code, l.kanal, l.kampagne
  from public.creator_links l
  where l.code = p_code and l.aktiv;
$$;

comment on function public.creator_link_aufloesen(text) is
  'Loest einen Einstiegscode fuer /c/<code> auf. SECURITY DEFINER, weil die noetige Trennung zwischen Spalten verlaeuft (name ist personenbezogen) und Spalten-Rechte pro Rolle vergeben werden — Moderator und Normalnutzer sind beide `authenticated`. Gibt nur code/kanal/kampagne eines AKTIVEN Codes zurueck und kann nicht auflisten (0080).';

-- EXECUTE liegt bei einer neuen Funktion standardmässig bei PUBLIC.
-- Entziehen und gezielt neu vergeben — dieselbe Linie wie 0047/0048/0071
-- und die Falle, die supabase/migrations/README.md beschreibt.
revoke execute on function public.creator_link_aufloesen(text) from public;
grant execute on function public.creator_link_aufloesen(text) to anon, authenticated;
