-- =====================================================================
-- 0128 — Indizes für Fremdschlüssel, die mit der Nutzung wachsen
-- =====================================================================
--
-- Der Performance-Advisor meldet 17 Fremdschlüssel ohne passenden Index
-- (Audit 2026-09-24). Ohne Index muss Postgres beim Löschen der
-- referenzierten Zeile — vor allem bei einer Kontolöschung, die über
-- auth.users kaskadiert — die ganze referenzierende Tabelle absuchen, und
-- jede Abfrage "alle Zeilen dieser Person" ebenso.
--
-- Hier nur die, deren Tabellen mit jeder Fahrt, jeder Meldung oder jedem
-- Fahrzeug wachsen. Bewusst NICHT indexiert: bearbeitet_von / erstellt_von
-- (Moderationsspalten, selten gefiltert, fast immer null) und die
-- code-Schlüssel auf creator_links (eine Handvoll Codes).
--
-- Heute alle Tabellen klein (fahrt_starts: 34 Zeilen) — die Indizes kosten
-- also fast nichts und sind da, bevor es darauf ankommt.

create index if not exists fahrt_starts_user_id_idx on public.fahrt_starts (user_id);
create index if not exists fahrt_starts_strecke_id_idx on public.fahrt_starts (strecke_id);
create index if not exists fahrt_starts_eingeloest_von_idx on public.fahrt_starts (eingeloest_von);

create index if not exists feedback_user_id_idx on public.feedback (user_id);

create index if not exists completion_reports_reporter_id_idx on public.completion_reports (reporter_id);
create index if not exists route_reports_reporter_id_idx on public.route_reports (reporter_id);
create index if not exists rating_reports_reporter_id_idx on public.rating_reports (reporter_id);

-- Zusammengesetzter Schlüssel (fahrzeug_id, user_id) auf vehicles(id, user_id).
create index if not exists wartungseintraege_fahrzeug_user_idx
  on public.wartungseintraege (fahrzeug_id, user_id);
create index if not exists wartungserinnerungen_fahrzeug_user_idx
  on public.wartungserinnerungen (fahrzeug_id, user_id);
