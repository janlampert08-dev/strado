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
-- 'vergeben', 'unveraendert', 'ungueltig'. Nicht angemeldet ist kein erwartbarer Fall
-- und wirft.
--
-- NUMMER 0109, NICHT 0103. Geschrieben als 0103, aber vor dem Einspielen
-- umbenannt: 0103 (amtliche_tempolimits_entlang_schneller) und 0104
-- (paesse) sind in Produktion vergeben. Eine zweite, halb eingespielte
-- Nummer wäre schlimmer als die sechs Altpaare.
--
-- NORMALISIERT UND GESPERRT (Review 2026-09-18). Die erste Fassung prüfte
-- mit btrim(), das nur ASCII-Leerzeichen entfernt, und lower() auf dem
-- Rohwert. "Jan" + Nullbreite-Leerzeichen, "Jan" + NBSP oder "Jan" + Zeilenumbruch galten
-- damit als frei, und ein bestehendes Konto hätte sich später in einen
-- Doppelgänger umbenennen können. Jetzt: NFKC-Normalisierung (fasst
-- Kompatibilitätszeichen wie NBSP und Vollbreiten-Buchstaben zusammen),
-- Leerraum jeder Art auf ein Leerzeichen, und Steuer- sowie unsichtbare
-- Formatzeichen werden abgewiesen ('ungueltig').
--
-- Die Eindeutigkeit war nur eine Prüfung, kein Constraint: zwei
-- gleichzeitige Umbenennungen (oder eine Umbenennung neben einer
-- Registrierung) konnten beide durchgehen. Der partielle Unique-Index auf
-- lower(display_name) macht sie verbindlich — für diese Funktion und für
-- handle_new_user, dessen Name aus client-setzbaren Metadaten stammt. Vor
-- dem Anlegen gemessen: 15 Profile, keine Dublette; gelöschte Konten
-- tragen display_name = null (anonymize_account) und fallen aus dem Index.
--
-- Wie in 0088/0100: EXECUTE ausdrücklich von PUBLIC UND anon entziehen —
-- Supabase vergibt an anon einen direkten Grant auf jede neue Funktion in
-- public, und ein revoke from public allein lässt ihn stehen (die Falle aus
-- 0047, 0048, 0091, 0097).

create unique index profiles_display_name_lower_eindeutig
  on public.profiles (lower(display_name))
  where display_name is not null;

create function public.profilname_aendern(p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(
    regexp_replace(normalize(coalesce(p_name, ''), NFKC), '[[:space:]]+', ' ', 'g')
  );
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

  -- Steuerzeichen, weiche Trennstriche, Nullbreiten- und Richtungszeichen,
  -- Wortverbinder, BOM: nichts davon gehört sichtbar in einen Namen, und
  -- alles davon macht aus einem vergebenen Namen einen scheinbar freien.
  if v_name ~ '[[:cntrl:]\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0]' then
    return 'ungueltig';
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

  begin
    update public.profiles
    set display_name = v_name
    where id = v_uid;
  exception when unique_violation then
    -- Die Prüfung oben hat ein gleichzeitiges Rennen verloren.
    return 'vergeben';
  end;

  return 'ok';
end;
$$;

comment on function public.profilname_aendern(text) is
  'Ändert den Anzeigenamen des aufrufenden Kontos (auth.uid()) nach denselben Regeln wie signUp(): 2–50 Zeichen, case-insensitiv eindeutig. SECURITY DEFINER, weil display_name keinen UPDATE-Grant hat (0034) und keinen bekommen soll. Rückgabe: ok | zu_kurz | zu_lang | vergeben | unveraendert | ungueltig.';

revoke execute on function public.profilname_aendern(text) from public;
revoke execute on function public.profilname_aendern(text) from anon;
grant execute on function public.profilname_aendern(text) to authenticated;
