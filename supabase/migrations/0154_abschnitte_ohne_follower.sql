-- =====================================================================
-- 0154 — Erkannte Abschnitte werden nie "nur für Follower"
-- =====================================================================
--
-- Seit 0151 folgen erkannte Streckenabschnitte (parent_completion_id gesetzt)
-- der Öffentlichkeit ihrer Fahrt — synchronisiert wird aber nur
-- ist_oeffentlich. Eine eigene Follower-Stufe auf einem Abschnitt bliebe
-- stehen, wenn die Fahrt privat gestellt wird: der Abschnitt samt Track wäre
-- für Follower weiter sichtbar, obwohl die Fahrt es nicht mehr ist.
-- (Code-Review vor dem Release, 2026-09-25: das Menü auf der Fahrtseite
-- eines Abschnitts bot "Nur mit Followern teilen" an.)
--
-- Der Trigger aus 0145 verengt deshalb jetzt auch bei Abschnitten, statt
-- sich auf die Oberfläche zu verlassen. Katalogstand vom 2026-09-25 plus
-- eine Bedingung. Am 2026-09-25 gemessen: 0 Abschnitte mit fuer_follower.
--
-- REIHENFOLGE: unabhängig vom Code.
--
-- WEG ZURÜCK: die Funktion aus 0145 (Abschnitt B) neu anlegen.

create or replace function public.enforce_follower_sichtbarkeit()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.fuer_follower and (
    new.ist_oeffentlich
    or new.importiert
    or new.parent_completion_id is not null
    or (new.art = 'strecke' and coalesce(new.abdeckung_prozent, 0) < 75)
    or (new.art = 'frei' and new.track is null)
  ) then
    new.fuer_follower := false;
    if not new.ist_oeffentlich then
      new.track_oeffentlich := null;
    end if;
  end if;
  return new;
end;
$$;
