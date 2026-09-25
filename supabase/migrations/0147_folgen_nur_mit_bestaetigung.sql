-- =====================================================================
-- 0147 — Folgen nur mit Bestätigung, wo sie verlangt ist
-- =====================================================================
--
-- Zweiter Schritt zu 0146. Bis hier ist folgen_bestaetigen nur eine
-- Absicht: die Insert-Policy auf follows lässt jeden jedem folgen, und ein
-- direkter PostgREST-Aufruf umginge jede Anfrage. Diese Datei verbietet das
-- direkte Folgen, wenn der Gefolgte bestätigen will — dann bleibt nur die
-- Anfrage (folge_anfragen) und deren Annahme (folgeanfrage_annehmen, läuft
-- als SECURITY DEFINER und ist von dieser Policy nicht betroffen).
--
-- REIHENFOLGE — wichtig: ERST einspielen, wenn der Code, der Anfragen
-- stellt (lib/actions/follows.ts, PR "Folgeanfragen"), auf main läuft. Der
-- alte Folgen-Knopf schreibt direkt in follows; da folgen_bestaetigen für
-- alle voreingestellt an ist, scheiterte danach JEDES Folgen in der
-- Produktion, bis der neue Code ankommt.
--
-- PRÜFUNG DANACH: als angemeldeter Nutzer einem Konto mit
-- folgen_bestaetigen = true direkt in follows folgen → abgelehnt (RLS);
-- über die App → Anfrage erscheint beim Gefolgten unter /aktivitaet.
--
-- WEG ZURÜCK:
--   alter policy "Nutzer folgen anderen Nutzern" on public.follows
--     with check ((select auth.uid()) = follower_id);

set lock_timeout = '5s';

alter policy "Nutzer folgen anderen Nutzern" on public.follows
  with check (
    (select auth.uid()) = follower_id
    and not public.folgen_braucht_bestaetigung(followed_id)
  );
