-- Den eigenen Anzeigenamen ändern.
--
-- Bis hierher gab es dafür keinen Weg: display_name wird einmal bei der
-- Registrierung gesetzt (handle_new_user, 0001 → 0088/0094) und war danach
-- fest. Im UI/UX-Review vom 2026-09-17 als fehlend benannt, auf Auftrag des
-- Inhabers gebaut.
--
-- WARUM EINE FUNKTION UND KEIN SPALTEN-GRANT. 0034 vergibt UPDATE auf
-- profiles nur spaltenweise, display_name ist nicht dabei. Ihn einfach
-- dazuzunehmen hiesse, jede Regel, die signUp() in lib/actions/auth.ts an
-- den Namen stellt (2–50 Zeichen, case-insensitiv eindeutig), per
-- PostgREST umgehbar zu machen — ein direkter PATCH setzte einen leeren
-- Namen, einen 5000-Zeichen-Namen oder den Namen eines anderen Kontos. Die
-- Funktion prüft dieselben Regeln in der Datenbank, wo sie niemand umgeht.
--
-- SECURITY DEFINER, weil der Aufrufer die Spalte nicht selbst schreiben darf
-- (siehe oben) — und eng: sie ändert genau eine Spalte genau einer Zeile,
-- der von auth.uid(), und nimmt keinen Nutzer-Parameter entgegen. Die
-- Eindeutigkeitsprüfung liest profiles über alle Zeilen; das darf auch
-- authenticated (Policy "Profile sind öffentlich lesbar", Grant auf
-- display_name seit 0034), die Funktion erweitert dort also nichts.
--
-- Gelöschte Konten (geloescht_am gesetzt, 0076) werden abgewiesen, auch
-- wenn eine noch gültige Sitzung den Aufruf erlaubte.
--
-- Rückgabe als Code statt Exception für die erwartbaren Fälle, damit die
-- Server Action eine verständliche Meldung formulieren kann, ohne
-- Fehlertexte der Datenbank zu parsen: 'ok', 'zu_kurz', 'zu_lang',
-- 'vergeben', 'unveraendert'. Nicht angemeldet ist kein erwartbarer Fall
-- und wirft.
--
-- Wie in 0088/0100: EXECUTE ausdrücklich von PUBLIC UND anon entziehen —
-- Supabase vergibt an anon einen direkten Grant auf jede neue Funktion in
-- public, und ein revoke from public allein lässt ihn stehen (die Falle aus
-- 0047, 0048, 0091, 0097).

create function public.profilname_aendern(p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_bisher text;
  v_geloescht timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select display_name, geloescht_am into v_bisher, v_geloescht
  from public.profiles
  where id = v_uid;

  if not found or v_geloescht is not null then
    raise exception 'kein aktives Profil' using errcode = '42501';
  end if;

  if char_length(v_name) < 2 then
    return 'zu_kurz';
  end if;
  if char_length(v_name) > 50 then
    return 'zu_lang';
  end if;
  if v_bisher is not null and v_bisher = v_name then
    return 'unveraendert';
  end if;

  -- Dieselbe Regel wie signUp(): case-insensitiv eindeutig. Ein reiner
  -- Gross-/Kleinschreibungswechsel des eigenen Namens ("jan" → "Jan") ist
  -- erlaubt, deshalb die eigene Zeile ausgenommen.
  if exists (
    select 1
    from public.profiles
    where lower(display_name) = lower(v_name)
      and id <> v_uid
  ) then
    return 'vergeben';
  end if;

  update public.profiles
  set display_name = v_name
  where id = v_uid;

  return 'ok';
end;
$$;

comment on function public.profilname_aendern(text) is
  'Ändert den Anzeigenamen des aufrufenden Kontos (auth.uid()) nach denselben Regeln wie signUp(): 2–50 Zeichen, case-insensitiv eindeutig. SECURITY DEFINER, weil display_name keinen UPDATE-Grant hat (0034) und keinen bekommen soll. Rückgabe: ok | zu_kurz | zu_lang | vergeben | unveraendert.';

revoke execute on function public.profilname_aendern(text) from public;
revoke execute on function public.profilname_aendern(text) from anon;
grant execute on function public.profilname_aendern(text) to authenticated;
