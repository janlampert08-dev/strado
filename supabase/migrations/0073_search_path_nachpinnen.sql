-- =====================================================================
-- search_path für die Funktionen ab 0059 nachpinnen.
--
-- Befund aus docs/audit/2026-09-07-followup.md, Abschnitt Datenbank.
--
-- .agents/database.md und das Audit vom 2026-09-06 beschreiben die
-- Disziplin als durchgehend ("all 12 pin search_path"). Ab 0059 ist sie
-- es nicht mehr: zehn Funktionen aus den Premium- und
-- Gründerplatz-Migrationen legen den Pfad nicht fest.
--
-- Alle zehn sind SECURITY INVOKER, laufen also mit den Rechten des
-- Aufrufers — das Risiko ist entsprechend begrenzt. Es ist trotzdem
-- keine Formalie: darf_private_strecke_anlegen() ist an authenticated
-- gegrantet (0064:138), und ein Aufrufer kann seinen eigenen
-- search_path setzen. Eine Funktion, die unqualifizierte Namen
-- auflöst, greift dann möglicherweise auf ein anderes Schema.
--
-- Korrektur zum Audit-Text: Dort steht,
-- private_strecken_kontingent_pruefen() pinne den Pfad bereits. Die
-- Funktion heisst private_strecke_kontingent_pruefen (Einzahl) und
-- pinnt ihn NICHT — sie steht deshalb unten mit in der Liste.
--
-- ALTER FUNCTION ... SET ändert weder Rechte noch Rumpf; bestehende
-- GRANTs bleiben unangetastet. Risiko: sehr niedrig.
--
-- pg_temp gehört ans Ende: Ohne explizite Nennung hängt Postgres es
-- vorne an, und ein temporäres Objekt könnte dann ein echtes
-- verdecken.
-- =====================================================================

-- Premium-Abozustand (0059, apply_subscription_state zuletzt 0062).
alter function public.subscription_ist_premium(text, timestamptz)
  set search_path = public, pg_temp;

alter function public.apply_subscription_state(
  text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer
) set search_path = public, pg_temp;

alter function public.premium_abgleich()
  set search_path = public, pg_temp;

-- Private Strecken (0064, 0067).
alter function public.darf_private_strecke_anlegen()
  set search_path = public, pg_temp;

alter function public.private_strecke_kontingent_pruefen()
  set search_path = public, pg_temp;

-- Gründerplätze (0065/0066, zuletzt 0068/0069).
alter function public.gruenderplaetze_belegt()
  set search_path = public, pg_temp;

alter function public.gruenderplaetze_frei(integer)
  set search_path = public, pg_temp;

alter function public.gruenderplatz_beanspruchen(uuid, integer, integer)
  set search_path = public, pg_temp;

alter function public.gruenderplatz_bestaetigen(uuid)
  set search_path = public, pg_temp;

alter function public.gruenderplatz_bestaetigen_fuer_customer(text)
  set search_path = public, pg_temp;

-- Bewusst NICHT in dieser Liste: die beiden Funktionen aus dem
-- unangewendeten 0059_fahrtstatistiken_serverseitig_erzwingen.sql
-- (enforce_route_completion_stats/_coverage). Sie existieren in der
-- Datenbank nicht, ein ALTER darauf würde diese Migration abbrechen
-- lassen. Wenn jene Datei eingespielt wird, braucht sie zusätzlich
-- extensions im Pfad — sie ruft st_length auf.
