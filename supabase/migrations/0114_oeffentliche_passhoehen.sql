-- "Pässe befahren" zählt Passhöhen, nicht Strecken — auch auf dem
-- öffentlichen Profil.
--
-- Entscheid des Inhabers vom 2026-09-19. Bis hierher zählte die Kachel jede
-- befahrene Strecke einmal, auch eine Runde ums Dorf, und stand auf dem
-- eigenen Profil neben einer zweiten, anderen Pass-Zahl (Passsammlung, 0104).
-- Das eigene Profil und die Auszeichnungen lesen jetzt meine_paesse()
-- (0104/0113). Für ein FREMDES Profil geht das nicht: meine_paesse() rechnet
-- auf auth.uid(), und die Tracks anderer sind für den Aufrufer nicht lesbar
-- (RLS auf route_completions; public_fahrten führt keinen Track).
--
-- Deshalb diese Funktion, SECURITY DEFINER und eng:
--   - sie gibt nur eine ZAHL heraus, nie einen Track, eine Fahrt oder einen
--     Pass-Namen;
--   - sie zählt genau die Fahrten, die auch public_fahrten zeigt (dieselbe
--     WHERE-Bedingung, live gelesen am 2026-09-19): öffentlich geteilt, und
--     entweder eine freie Fahrt oder eine Strecke, die freigegeben und nicht
--     privat ist;
--   - sie antwortet NULL, wenn das Konto "Anzahl befahrener Pässe zeigen"
--     (profiles.zeigt_paesse, 0018) ausgeschaltet hat oder gelöscht ist —
--     dieselbe Schranke, die app/fahrer/[id] schon im Code zieht, hier in der
--     Datenbank, wo sie niemand umgeht;
--   - erkannte Abschnitte (parent_completion_id) zählen nicht, wie in 0113.
--
-- Was die Zahl verrät, ist ohnehin öffentlich: welche öffentlich geteilten
-- Fahrten jemand hat, zeigt das Profil schon; ob eine davon über einen der
-- 34 Scheitel führte, ist dieselbe Auskunft auf gröberer Stufe. Die Tracks
-- selbst — und damit die Privatzonen (lib/publicTrack.ts) — berührt die
-- Funktion nur innerhalb von st_dwithin um einen Passscheitel.
--
-- anon darf sie aufrufen, weil öffentliche Profile ohne Anmeldung lesbar
-- sind; ausdrücklich gewährt statt über den Supabase-Standard, damit die
-- Absicht im Katalog steht.
--
-- Rückweg: drop function public.oeffentliche_passhoehen(uuid);

create function public.oeffentliche_passhoehen(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
    when not exists (
      select 1 from public.profiles pr
      where pr.id = p_user_id
        and pr.zeigt_paesse
        and pr.geloescht_am is null
    ) then null
    else (
      select count(distinct pa.id)::integer
      from public.route_completions rc
      left join public.routes r on r.id = rc.route_id
      join public.paesse pa on st_dwithin(rc.track, pa.scheitel, 150)
      where rc.user_id = p_user_id
        and rc.track is not null
        and rc.parent_completion_id is null
        and rc.ist_oeffentlich = true
        and (
          (rc.art = 'frei' and rc.route_id is null)
          or (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
        )
    )
  end;
$$;

comment on function public.oeffentliche_passhoehen(uuid) is
  'Anzahl verschiedener Passhöhen (0104), deren Scheitel ein öffentlich geteilter Track dieses Kontos auf 150 m nahekommt — dieselben Fahrten wie public_fahrten, ohne erkannte Abschnitte. NULL, wenn zeigt_paesse aus ist oder das Konto gelöscht. Nur eine Zahl, keine Tracks.';

revoke execute on function public.oeffentliche_passhoehen(uuid) from public;
grant execute on function public.oeffentliche_passhoehen(uuid) to anon, authenticated;
