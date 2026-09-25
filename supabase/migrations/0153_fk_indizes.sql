-- =====================================================================
-- 0153 — Indizes auf acht Fremdschlüsseln ohne Index
-- =====================================================================
--
-- WARUM
-- Der Performance-Advisor (unindexed_foreign_keys) meldet am 2026-09-25
-- acht Fremdschlüssel ohne passenden Index. Ohne Index muss Postgres beim
-- Löschen/Ändern der referenzierten Zeile (z. B. einem Profil bei der
-- Kontolöschung) die ganze Tabelle durchsuchen. Alle Tabellen sind klein
-- (Moderation, Creator-Links, Promo-Codes), deshalb reicht ein normales
-- CREATE INDEX ohne CONCURRENTLY. 0128 hat dasselbe für die wachsenden
-- Tabellen gemacht; das hier sind die kleinen, die damals fehlten.
--
-- WAS SICH ÄNDERT
-- Nur Indizes, keine Daten, keine Rechte.
--
-- PRÜFEN (nach dem Einspielen)
-- get_advisors(performance): unindexed_foreign_keys ist leer.
--
-- ZURÜCK
-- drop index if exists <name>; für jeden der acht Indizes.

create index if not exists completion_reports_bearbeitet_von_idx
  on public.completion_reports (bearbeitet_von);
create index if not exists rating_reports_bearbeitet_von_idx
  on public.rating_reports (bearbeitet_von);
create index if not exists route_reports_bearbeitet_von_idx
  on public.route_reports (bearbeitet_von);
create index if not exists feedback_bearbeitet_von_idx
  on public.feedback (bearbeitet_von);
create index if not exists creator_links_erstellt_von_idx
  on public.creator_links (erstellt_von);
create index if not exists pass_sperrtage_erstellt_von_idx
  on public.pass_sperrtage (erstellt_von);
create index if not exists premium_gratis_code_idx
  on public.premium_gratis (code);
create index if not exists registrierung_herkunft_code_idx
  on public.registrierung_herkunft (code);
