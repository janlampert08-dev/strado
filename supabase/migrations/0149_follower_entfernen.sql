-- =====================================================================
-- 0149 — Follower entfernen
-- =====================================================================
--
-- Seit 0145 gibt es Fahrten "nur für Follower", seit 0146 müssen neue
-- Follower bestätigt werden. Wer aber VOR 0146 gefolgt ist, brauchte keine
-- Bestätigung — und die Delete-Policy auf follows liess nur den Folgenden
-- selbst löschen ("Nutzer entfolgen": follower_id = auth.uid()). Der
-- Gefolgte konnte einen Follower also nicht loswerden, und jeder, der je
-- gefolgt war, sah dessen Follower-Fahrten auf Dauer. (Code-Review vor dem
-- Release, 2026-09-25.)
--
-- Neu darf auch der Gefolgte die Beziehung löschen. Der Name der Policy
-- bleibt, damit spätere Aufräum-Migrationen sie dort finden, wo sie sie
-- erwarten (vgl. 0139).
--
-- REIHENFOLGE: unabhängig vom Code. Die Policy erweitert nur, was gelöscht
-- werden darf; der alte Code löscht weiterhin nur eigene Follows.
--
-- PRÜFUNG DANACH: als Gefolgter eine follows-Zeile löschen, deren
-- followed_id man selbst ist → 1 Zeile; eine fremde → 0 Zeilen.
--
-- WEG ZURÜCK:
--   alter policy "Nutzer entfolgen" on public.follows
--     using ((select auth.uid()) = follower_id);

set lock_timeout = '5s';

alter policy "Nutzer entfolgen" on public.follows
  using ((select auth.uid()) = follower_id or (select auth.uid()) = followed_id);
