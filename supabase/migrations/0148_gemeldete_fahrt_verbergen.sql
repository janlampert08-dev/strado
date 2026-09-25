-- =====================================================================
-- 0148 — "Fahrt verbergen" in der Moderation funktioniert wieder
-- =====================================================================
--
-- GEMESSEN am 2026-09-25 (Produktion, zurückgerollt): ein Moderator trifft
-- mit einem UPDATE auf route_completions 0 Zeilen. Die Update-Policy
-- ("Nutzer bearbeiten eigene Fahrten, Moderatoren entöffentlichen", 0139)
-- lässt ihn zwar zu, aber ein UPDATE sieht nur Zeilen, die der Aufrufer auch
-- LESEN darf — und die einzige SELECT-Policy auf route_completions ist
-- "Nutzer sehen eigene Fahrten". unpublishReportedCompletion
-- (lib/actions/moderation.ts) meldete deshalb bei jeder fremden Fahrt
-- "nichts getroffen"; gemeldete Fahrten liessen sich nicht verbergen.
--
-- Bewusst KEINE SELECT-Policy für Moderatoren: sie gäbe ihnen über PostgREST
-- jede Fahrt aller Nutzer frei, private Fahrten und vollständige GPS-Tracks
-- eingeschlossen — weit mehr, als "eine gemeldete Fahrt verbergen" braucht.
-- Stattdessen eine SECURITY-DEFINER-Funktion, die genau das tut und nur
-- das: sie prüft die Rolle, verlangt eine offene Meldung auf genau dieser
-- Fahrt, nimmt die Fahrt ganz aus der Sicht (öffentlich UND Follower, 0145)
-- und schliesst in derselben Transaktion die offenen Meldungen dazu.
--
-- Die Moderatorenprüfung liest profiles.is_moderator direkt. Das ist in
-- einer SECURITY-DEFINER-Funktion zulässig — die Regel aus 0134 betrifft
-- Policies, die als Aufrufer laufen — und macht die Funktion unabhängig
-- davon, ob 0134 (ist_moderator()) schon eingespielt ist.
--
-- REIHENFOLGE: vor dem Code. Der alte Code ruft die Funktion nicht auf und
-- bleibt so kaputt, wie er ist; der neue braucht sie.
--
-- PRÜFUNG DANACH:
--   select has_function_privilege('anon', 'public.gemeldete_fahrt_verbergen(uuid)', 'execute');  -- false
--   Als Moderator auf staging eine gemeldete Fahrt verbergen: sie
--   verschwindet aus Feed und Profil, die Meldung aus der Warteschlange.
--
-- WEG ZURÜCK:
--   drop function public.gemeldete_fahrt_verbergen(uuid);

create or replace function public.gemeldete_fahrt_verbergen(p_completion_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_moderator
  ) then
    raise exception 'not_moderator';
  end if;

  -- Nur, was gemeldet ist. Ohne offene Meldung gibt es für die Moderation
  -- keinen Anlass, eine fremde Fahrt anzufassen.
  if not exists (
    select 1 from public.completion_reports cr
    where cr.completion_id = p_completion_id and cr.status = 'offen'
  ) then
    return false;
  end if;

  update public.route_completions
  set ist_oeffentlich = false,
      fuer_follower = false,
      track_oeffentlich = null
  where id = p_completion_id;

  if not found then
    return false;
  end if;

  update public.completion_reports
  set status = 'erledigt',
      bearbeitet_am = now(),
      bearbeitet_von = auth.uid()
  where completion_id = p_completion_id and status = 'offen';

  return true;
end;
$$;

comment on function public.gemeldete_fahrt_verbergen(uuid) is
  'Moderation: nimmt eine Fahrt mit offener Meldung ganz aus der Sicht (öffentlich und Follower) und schliesst die offenen Meldungen (0148). Nur für Moderatoren; ersetzt das direkte UPDATE, das mangels SELECT-Policy 0 Zeilen traf.';

-- Supabase gibt anon für jede neue Funktion EXECUTE direkt — ausdrücklich
-- entziehen (0047/0048/0091).
revoke execute on function public.gemeldete_fahrt_verbergen(uuid) from public, anon;
grant execute on function public.gemeldete_fahrt_verbergen(uuid) to authenticated;
