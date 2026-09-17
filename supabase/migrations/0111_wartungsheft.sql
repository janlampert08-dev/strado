-- =====================================================================
-- Wartungsheft mit MFK- und Service-Erinnerung (Premium)
--
-- Pro Fahrzeug ein digitales Serviceheft: Einträge (Service, MFK,
-- Pneuwechsel …) mit Datum, optional Kilometerstand, Kosten und Notiz —
-- und pro Fahrzeug höchstens eine Zeile Erinnerungseinstellungen
-- (nächster MFK-Termin, Serviceintervall in km und/oder Monaten). Die
-- Fälligkeiten werden NICHT gespeichert, sondern in lib/wartung.ts aus
-- Einträgen, Einstellungen und den aufgezeichneten Fahrten abgeleitet;
-- eine gespeicherte Fälligkeit wäre mit der nächsten Fahrt veraltet.
-- Plan und Begründung: docs/premium-ausbau-plan.md §4 — mit den
-- Abweichungen, die unten jeweils an Ort und Stelle stehen.
--
-- ---------------------------------------------------------------------
-- Warum zwei neue Tabellen und keine Spalten auf vehicles
-- ---------------------------------------------------------------------
-- vehicles ist NICHT privat: die Policy "Fahrzeuge sichtbar wenn
-- freigegeben" (0015) gibt jede Zeile an jeden frei, dessen Besitzer
-- zeigt_fahrzeuge eingeschaltet hat, und die Tabelle trägt die
-- Supabase-Standardgrants. Ein naechste_mfk_am dort stünde auf dem
-- öffentlichen Profil zum Abruf bereit. Das Wartungsheft ist privat und
-- bleibt es, also eigene Tabellen mit eigener RLS — und keine View.
--
-- ---------------------------------------------------------------------
-- Eigentum: im Schema erzwungen, nicht nur in der Policy
-- ---------------------------------------------------------------------
-- user_id steht redundant zum Fahrzeug, damit die Policies ein
-- Spaltenvergleich bleiben (auth.uid() = user_id) statt eines Subselects
-- auf vehicles pro Zeile. Redundanz braucht eine Klammer, sonst liesse
-- sich eine fremde fahrzeug_id mit der eigenen user_id eintragen. Die
-- Klammer ist ein zusammengesetzter Fremdschlüssel
--   (fahrzeug_id, user_id) → vehicles (id, user_id)
-- — ein Eintrag kann damit strukturell nur an einem Fahrzeug hängen, das
-- derselben Person gehört, ganz gleich, über welchen Weg geschrieben wird
-- (Server Action, direkter PostgREST-Request, künftiger SECURITY-DEFINER-
-- Code). Ein Trigger könnte dasselbe, wäre aber Code, der gelesen und
-- gepflegt werden will; der Fremdschlüssel ist eine Deklaration. Er hält
-- zugleich die Gegenrichtung: solange Einträge an einem Fahrzeug hängen,
-- kann dessen user_id nicht wechseln (ON UPDATE NO ACTION).
--
-- Die Prüfung des Fremdschlüssels läuft mit den Rechten des
-- Tabelleneigentümers und an RLS vorbei. Sie verrät trotzdem nichts: ein
-- Versuch mit fremder fahrzeug_id und eigener user_id scheitert, ob es das
-- Fahrzeug gibt oder nicht, weil das PAAR nicht existiert.
--
-- Dafür braucht vehicles einen Unique-Constraint auf (id, user_id). id ist
-- schon Primärschlüssel, der neue Index ist also fachlich redundant und
-- existiert nur als Ziel des Fremdschlüssels. Die Tabelle ist klein
-- (einstellige bis zweistellige Zeilenzahl, Stand 2026-09); der Aufbau
-- nimmt kurz ACCESS EXCLUSIVE — daher der lock_timeout unten.
--
-- ---------------------------------------------------------------------
-- Premium: additiv, und nach dem Ablauf bleiben die Daten der Person
-- ---------------------------------------------------------------------
-- INSERT und UPDATE verlangen profiles.ist_premium — in der Policy, damit
-- es auch für den Direktweg über PostgREST gilt, und zusätzlich in der
-- Server Action über istPremium() (lib/actions/wartung.ts), damit die
-- Oberfläche einen verständlichen Satz statt eines RLS-Fehlers zeigt.
-- SELECT und DELETE verlangen es NICHT: wer Premium beendet, behält Lesen
-- und Löschen seiner eigenen Einträge. Weggenommen wird nichts, was heute
-- existiert (docs/premium-plan.md §4, additives Gating) — das Wartungsheft
-- ist neu.
--
-- profiles.ist_premium ist für authenticated lesbar (Spalten-Grant 0034)
-- und NICHT schreibbar (0027/0034) — ein Konto kann sich die Prüfung also
-- nicht selbst erfüllen. Dasselbe Muster wie 0077.
--
-- ---------------------------------------------------------------------
-- Löschen: Fahrzeug, Konto, Anonymisierung
-- ---------------------------------------------------------------------
-- Beide Tabellen hängen mit ON DELETE CASCADE am Fahrzeug. Das deckt alle
-- drei Wege ab:
--   * Fahrzeug entfernen (deleteVehicle) → Einträge und Erinnerungen weg.
--   * Konto löschen: deleteAccount() löscht auth.users NICHT, sondern ruft
--     anonymize_account() (letzter Rumpf 0092), und die führt
--     `delete from public.vehicles where user_id = p_user_id` aus — die
--     Kaskade nimmt beide Tabellen mit. anonymize_account() wird deshalb
--     hier bewusst NICHT neu geschrieben: ein create or replace auf eine
--     Live-Funktion, deren Rumpf parallel in anderen Zweigen wachsen kann,
--     wäre das Risiko, das AGENTS.md ("A create or replace on a live
--     function needs the live body read first") beschreibt, ohne Gewinn.
--   * Löschte jemand je auth.users direkt: user_id hängt zusätzlich mit
--     ON DELETE CASCADE an auth.users.
-- Weil jede Zeile ein NOT NULL fahrzeug_id mit Kaskade trägt, kann keine
-- Zeile ihr Fahrzeug überleben. Die Notiz (Freitext, potenziell
-- personenbezogen) und die Kosten verschwinden damit vollständig.
--
-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
-- Supabase vergibt jeder neuen Tabelle in public volle Rechte an anon UND
-- authenticated, und zwar direkt — ein revoke from public fasst das nicht
-- an (die Falle aus 0047/0048/0091/0097). Also ausgeschrieben:
-- `revoke all … from public, anon, authenticated`, danach nur, was die App
-- braucht, an authenticated. INSERT und UPDATE als Spalten-Grants: id und
-- created_at setzt die Datenbank, und ein UPDATE kann einen Eintrag weder
-- einem anderen Fahrzeug noch einem anderen Konto zuschieben.
--
-- Die Trigger-Funktion (Obergrenze) wird von anon und authenticated
-- entzogen; ein Trigger feuert ohne EXECUTE-Recht des Aufrufers.
--
-- ---------------------------------------------------------------------
-- Datumsprüfungen mit now()
-- ---------------------------------------------------------------------
-- Zwei CHECKs vergleichen mit dem heutigen Datum (Europe/Zurich, weil ein
-- Eintrag um 00:30 Schweizer Zeit sonst am UTC-Vortag scheitern würde —
-- dieselbe Überlegung wie todayInZurich() in lib/format.ts, die die Server
-- Action benutzt). PostgreSQL lässt das zu, verlangt aber, dass ein CHECK
-- sich über die Zeit nicht so ändert, dass gültige Zeilen ungültig werden
-- (sonst scheitert ein Restore). Beide Grenzen werden mit der Zeit nur
-- WEITER, nie enger — eine Zeile, die heute gilt, gilt auch morgen.
--
-- ---------------------------------------------------------------------
-- Reihenfolge beim Einspielen
-- ---------------------------------------------------------------------
-- Rein additiv: zwei neue Tabellen, ein neuer Unique-Constraint auf
-- vehicles, eine Trigger-Funktion. Nichts Bestehendes ändert sein
-- Verhalten. Schema zuerst, Code danach — umgekehrt antwortet die neue
-- Fahrzeugseite mit "relation does not exist" (lib/wartungsdaten.ts wirft
-- bei einem Abfragefehler, statt ihn als leeres Heft auszugeben).
--
-- ---------------------------------------------------------------------
-- Rückweg
-- ---------------------------------------------------------------------
--   drop table if exists public.wartungserinnerungen;
--   drop table if exists public.wartungseintraege;
--   drop function if exists public.wartungseintraege_obergrenze();
--   alter table public.vehicles drop constraint if exists vehicles_id_user_id_key;
-- Verliert alle Wartungsdaten unwiderruflich — vorher exportieren, falls
-- schon Premium-Konten Einträge haben.
-- =====================================================================

-- `set LOCAL` endet mit der Transaktion. `apply_migration` und
-- `supabase db push` klammern jede Datei ohnehin in eine; von Hand in psql
-- gehört sie in `begin; … commit;`, sonst ist diese Zeile wirkungslos
-- (dieselbe Anmerkung wie bei 0095).
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- A) Ziel des zusammengesetzten Fremdschlüssels
-- ---------------------------------------------------------------------
alter table public.vehicles
  add constraint vehicles_id_user_id_key unique (id, user_id);

-- ---------------------------------------------------------------------
-- B) Einträge
-- ---------------------------------------------------------------------
-- Die Arten und alle Grenzwerte stehen identisch in lib/wartung.ts
-- (WARTUNGSARTEN, MAX_KM_STAND, MAX_KOSTEN_CHF, MAX_NOTIZ_LAENGE,
-- FRUEHESTES_DATUM). Wer eine Seite ändert, ändert beide.
create table public.wartungseintraege (
  id uuid primary key default gen_random_uuid(),
  fahrzeug_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  art text not null
    constraint wartungseintraege_art_check
    check (art in ('service', 'mfk', 'pneuwechsel', 'bremsen', 'batterie', 'kette', 'sonstiges')),
  datum date not null
    constraint wartungseintraege_datum_check
    check (datum >= date '1950-01-01' and datum <= (now() at time zone 'Europe/Zurich')::date),
  km_stand integer
    constraint wartungseintraege_km_stand_check
    check (km_stand between 0 and 2000000),
  -- numeric(8,2): bis 999 999.99, der CHECK schneidet bei 100 000 ab.
  -- Franken und Rappen exakt, keine Gleitkommarundung in einer Summe.
  kosten_chf numeric(8, 2)
    constraint wartungseintraege_kosten_chf_check
    check (kosten_chf between 0 and 100000),
  notiz text
    constraint wartungseintraege_notiz_check
    check (char_length(notiz) <= 500),
  created_at timestamptz not null default now(),
  constraint wartungseintraege_fahrzeug_fkey
    foreign key (fahrzeug_id, user_id)
    references public.vehicles (id, user_id)
    on delete cascade
);

comment on table public.wartungseintraege is
  'Wartungsheft pro Fahrzeug (0111). Privat: RLS nur auf die eigene Zeile, keine View, kein anon-Grant. Anlegen/Aendern verlangt profiles.ist_premium, Lesen/Loeschen nicht (nach Premium-Ende bleiben die Daten der Person). (fahrzeug_id, user_id) ist ein Fremdschluessel auf vehicles (id, user_id) mit Kaskade — ein Eintrag haengt nur an einem eigenen Fahrzeug und geht mit ihm (auch ueber anonymize_account, das vehicles loescht).';

-- Die Detailseite liest die Einträge eines Fahrzeugs neueste zuerst; der
-- Index deckt zugleich den Fremdschlüssel (fahrzeug_id vorn) für die
-- Kaskade beim Löschen des Fahrzeugs ab. user_id für die Profilseite, die
-- alle Einträge eines Kontos auf einmal holt, und für isRateLimited.
create index wartungseintraege_fahrzeug_datum_idx
  on public.wartungseintraege (fahrzeug_id, datum desc, created_at desc);
create index wartungseintraege_user_created_idx
  on public.wartungseintraege (user_id, created_at desc);

alter table public.wartungseintraege enable row level security;

create policy "Eigene Wartungseintraege lesen"
  on public.wartungseintraege for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Wartungseintraege anlegen mit Premium"
  on public.wartungseintraege for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.ist_premium
    )
  );

create policy "Wartungseintraege aendern mit Premium"
  on public.wartungseintraege for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.ist_premium
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.ist_premium
    )
  );

-- Bewusst ohne Premium-Bedingung: die eigenen Daten bleiben löschbar.
create policy "Eigene Wartungseintraege loeschen"
  on public.wartungseintraege for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.wartungseintraege from public, anon, authenticated;
grant select, delete on public.wartungseintraege to authenticated;
grant insert (fahrzeug_id, user_id, art, datum, km_stand, kosten_chf, notiz)
  on public.wartungseintraege to authenticated;
grant update (art, datum, km_stand, kosten_chf, notiz)
  on public.wartungseintraege to authenticated;

-- ---------------------------------------------------------------------
-- C) Obergrenze pro Fahrzeug
-- ---------------------------------------------------------------------
-- Die Server Action bremst mit isRateLimited (2 s, lib/rateLimit.ts); der
-- Direktweg über PostgREST kennt diese Bremse nicht. Eine Obergrenze
-- hält die Tabelle trotzdem begrenzt: 1000 Einträge sind ein Fahrzeugleben
-- mit monatlichem Eintrag über 80 Jahre, niemand erreicht sie ehrlich.
--
-- SECURITY INVOKER: gezählt wird unter der RLS des Schreibenden, der seine
-- eigenen Zeilen ohnehin sieht — und nur die zählen, weil der
-- Fremdschlüssel oben garantiert, dass alle Einträge eines Fahrzeugs
-- derselben Person gehören. Das Advisory-Lock serialisiert parallele
-- Einfügungen am selben Fahrzeug, sonst kämen zwei gleichzeitige bei 999
-- beide durch. Schlüssel über hashtextextended mit eigenem Präfix, damit er
-- mit den Zahlenklassen aus 0024 (1–4) und den übrigen Schlüsseln nicht
-- kollidiert.
create function public.wartungseintraege_obergrenze()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('wartungseintraege:' || new.fahrzeug_id::text, 0));

  if (
    select count(*) from public.wartungseintraege
    where fahrzeug_id = new.fahrzeug_id
  ) >= 1000 then
    raise exception 'wartungseintraege_obergrenze';
  end if;

  return new;
end;
$$;

comment on function public.wartungseintraege_obergrenze() is
  'BEFORE INSERT auf wartungseintraege: hoechstens 1000 Eintraege pro Fahrzeug (0111). Missbrauchsbremse fuer den Direktweg ueber PostgREST, keine Geschaeftsregel.';

revoke execute on function public.wartungseintraege_obergrenze() from public, anon, authenticated;

create trigger wartungseintraege_obergrenze
  before insert on public.wartungseintraege
  for each row execute function public.wartungseintraege_obergrenze();

-- ---------------------------------------------------------------------
-- D) Erinnerungseinstellungen, höchstens eine Zeile pro Fahrzeug
-- ---------------------------------------------------------------------
-- fahrzeug_id als Primärschlüssel: mehr als eine Zeile pro Fahrzeug gäbe
-- es nur als Fehler. Eine Zeile mit drei NULL-Werten legt die Server
-- Action nicht an — sie löscht stattdessen.
--
-- Der MFK-Termin darf in der Vergangenheit liegen (eine überfällige MFK
-- ist genau der Fall, an den erinnert werden soll) und bis sechs Jahre in
-- der Zukunft: ein neuer Personenwagen muss erst nach fünf Jahren zur
-- ersten MFK. Zwei Jahre, wie zunächst vorgesehen, hätten genau diese
-- Fahrzeuge ausgeschlossen.
create table public.wartungserinnerungen (
  fahrzeug_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  naechste_mfk_am date
    constraint wartungserinnerungen_mfk_check
    check (
      naechste_mfk_am >= date '1950-01-01'
      and naechste_mfk_am <= ((now() at time zone 'Europe/Zurich')::date + interval '6 years')::date
    ),
  service_intervall_km integer
    constraint wartungserinnerungen_intervall_km_check
    check (service_intervall_km between 100 and 100000),
  service_intervall_monate integer
    constraint wartungserinnerungen_intervall_monate_check
    check (service_intervall_monate between 1 and 60),
  created_at timestamptz not null default now(),
  constraint wartungserinnerungen_fahrzeug_fkey
    foreign key (fahrzeug_id, user_id)
    references public.vehicles (id, user_id)
    on delete cascade
);

comment on table public.wartungserinnerungen is
  'MFK-Termin und Serviceintervall pro Fahrzeug (0111). Privat wie wartungseintraege, gleiche Premium-Regel (Anlegen/Aendern mit Premium, Lesen/Loeschen immer). Faelligkeiten werden nicht gespeichert, sondern in lib/wartung.ts abgeleitet.';

create index wartungserinnerungen_user_idx on public.wartungserinnerungen (user_id);

alter table public.wartungserinnerungen enable row level security;

create policy "Eigene Wartungserinnerungen lesen"
  on public.wartungserinnerungen for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Wartungserinnerungen anlegen mit Premium"
  on public.wartungserinnerungen for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.ist_premium
    )
  );

create policy "Wartungserinnerungen aendern mit Premium"
  on public.wartungserinnerungen for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.ist_premium
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.ist_premium
    )
  );

create policy "Eigene Wartungserinnerungen loeschen"
  on public.wartungserinnerungen for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.wartungserinnerungen from public, anon, authenticated;
grant select, delete on public.wartungserinnerungen to authenticated;
grant insert (fahrzeug_id, user_id, naechste_mfk_am, service_intervall_km, service_intervall_monate)
  on public.wartungserinnerungen to authenticated;
grant update (naechste_mfk_am, service_intervall_km, service_intervall_monate)
  on public.wartungserinnerungen to authenticated;
