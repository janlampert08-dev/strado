-- =====================================================================
-- 0151 — Streckenabschnitte folgen der Sichtbarkeit ihrer Fahrt
-- =====================================================================
--
-- Entscheid des Eigentümers vom 2026-09-25: "wenn fahrt als öffentlich
-- gepostet wird -> vorkommende streckenbestzeiten auch automatisch
-- öffentlich".
--
-- Bisher legte save_free_ride_with_segments jeden erkannten Abschnitt einer
-- freien Fahrt mit ist_oeffentlich = false an — egal, ob die Fahrt selbst
-- öffentlich war. Eine Bestzeit über den Klausen, gefahren in einer
-- öffentlich geteilten Tour, erschien damit nie in der Bestenliste
-- (route_leaderboard verlangt ist_oeffentlich). Und der Sichtbarkeits-
-- Umschalter (toggleCompletionVisibility) änderte nur die Fahrt, nie ihre
-- Abschnitte.
--
-- Jetzt als Regel in der Datenbank statt in einer Aufrufstelle, damit sie
-- für jeden Weg gilt (Speichern, Umschalter, Moderation):
--
--   1. Beim Einfügen erbt ein Abschnitt ist_oeffentlich von seiner Fahrt,
--      aber nur auf einer öffentlichen, freigegebenen Strecke.
--   2. Ändert sich ist_oeffentlich einer Fahrt, folgen ihre Abschnitte —
--      in beide Richtungen: wer die Fahrt privat stellt, nimmt auch die
--      Zeiten zurück.
--
-- Nur "öffentlich", nicht "für Follower" (0145): eine Bestzeit steht in
-- einer öffentlichen Bestenliste, das ist eine öffentliche Aussage.
--
-- Das letzte Wort behalten die bestehenden Trigger: der Deckungsgrad
-- (route_completions_recompute_coverage, ≥ 75 %) kann ist_oeffentlich nur
-- verengen, die Plausibilität der Zeit (0131) entscheidet weiter über
-- server/trail. Damit der Deckungsgrad nach dieser Regel greift, heisst der
-- BEFORE-Trigger route_completions_abschnitt_* — gleichzeitige Trigger
-- feuern alphabetisch, "abschnitt" vor "recompute_coverage".
--
-- Reihenfolge: ERST nach dem Deploy des Codes, der Abschnitte aus Feed und
-- Profillisten filtert (public_fahrten.ist_abschnitt, 0150). Vorher stünde
-- jeder öffentliche Abschnitt als eigene Fahrt im Feed.
--
-- Rückweg: drop trigger route_completions_abschnitt_erbt_sichtbarkeit,
-- route_completions_abschnitte_folgen on public.route_completions;
-- drop function public.abschnitt_sichtbarkeit_erben(),
-- public.abschnitte_sichtbarkeit_nachziehen(); die Nachführung unten mit
-- ist_oeffentlich = false für dieselben Zeilen zurücknehmen.

-- 1) Beim Einfügen erben
create or replace function public.abschnitt_sichtbarkeit_erben()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.parent_completion_id is null then
    return new;
  end if;
  new.ist_oeffentlich := coalesce((
    select p.ist_oeffentlich
      from public.route_completions p
     where p.id = new.parent_completion_id
       and p.user_id = new.user_id
  ), false)
  and exists (
    select 1 from public.routes r
     where r.id = new.route_id and r.status_ok and not r.ist_privat
  );
  return new;
end;
$$;

revoke execute on function public.abschnitt_sichtbarkeit_erben() from public, anon, authenticated;

create trigger route_completions_abschnitt_erbt_sichtbarkeit
  before insert on public.route_completions
  for each row execute function public.abschnitt_sichtbarkeit_erben();

-- 2) Bei Änderung der Fahrt nachziehen. SECURITY DEFINER, damit auch die
--    Moderations-Entöffentlichung (0071: Moderatoren dürfen nur verengen)
--    die Abschnitte fremder Fahrten erreicht — geschrieben wird dabei nur
--    ist_oeffentlich der Abschnitte genau dieser Fahrt.
create or replace function public.abschnitte_sichtbarkeit_nachziehen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.route_completions c
     set ist_oeffentlich = new.ist_oeffentlich
         and exists (
           select 1 from public.routes r
            where r.id = c.route_id and r.status_ok and not r.ist_privat
         )
   where c.parent_completion_id = new.id
     and c.user_id = new.user_id
     and c.ist_oeffentlich is distinct from new.ist_oeffentlich;
  return null;
end;
$$;

revoke execute on function public.abschnitte_sichtbarkeit_nachziehen() from public, anon, authenticated;

create trigger route_completions_abschnitte_folgen
  after update of ist_oeffentlich on public.route_completions
  for each row
  when (new.parent_completion_id is null and old.ist_oeffentlich is distinct from new.ist_oeffentlich)
  execute function public.abschnitte_sichtbarkeit_nachziehen();

-- 3) Bestehende Abschnitte öffentlicher Fahrten nachführen (am 2026-09-25:
--    1 Zeile). Der Deckungsgrad-Trigger prüft dabei jede Zeile erneut.
update public.route_completions c
   set ist_oeffentlich = true
  from public.route_completions p
 where c.parent_completion_id = p.id
   and c.user_id = p.user_id
   and p.ist_oeffentlich
   and not c.ist_oeffentlich
   and exists (
     select 1 from public.routes r
      where r.id = c.route_id and r.status_ok and not r.ist_privat
   );
