-- =====================================================================
-- 0094 — Nacharbeit an 0088/0091, aus dem Review zu PR #236
--
-- Drei Dinge, alle in derselben Richtung: weniger herausgeben, als 0091
-- herausgab, und halten, was 0088 im Kommentar versprochen hat.
--
-- 1. creator_verlauf() gibt nur noch Aufrufe zurück.
-- 2. handle_new_user() kann an der Herkunftsmessung nicht mehr scheitern.
-- 3. Ein Index als Vorsorge für die erste zeitfilternde Auswertung.
--
-- 0088-0093 sind am 2026-09-14 in Produktion eingespielt. Regel 9: dort
-- wird nichts geändert, das hier ist die neue Datei.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. creator_verlauf: Registrierungen und Abos raus
--
-- 0091 gab pro Code und Tag (klicks, registrierungen, abos) zurück, mit
-- grant execute an authenticated. Gezeichnet hat die Oberfläche davon
-- immer nur die Aufrufe (components/KlickVerlauf.tsx) — die beiden
-- anderen Spalten waren reine Angriffsfläche, und zwar eine, die der
-- veröffentlichten Datenschutzerklärung widerspricht: dort steht, ein
-- Creator erfahre "weder Name noch Zeitpunkt noch sonst ein Merkmal
-- eines einzelnen Kontos".
--
-- Genau das gab die Funktion aber her. Ein Creator braucht die
-- Oberfläche gar nicht: mit seinem eigenen Token und dem publishable
-- key genügt ein POST auf /rest/v1/rpc/creator_verlauf mit p_tage=90.
-- Steht dort an einem Tag eine 1, ist der Tag bekannt, an dem genau ein
-- Konto über ihn entstanden ist — und profiles.created_at ist seit 0034
-- an anon und authenticated gegrantet. Ein Tagesfenster mit einer
-- einzigen Zeile darin ist keine Anonymisierung.
--
-- Die Gesamtzahlen in creator_kennzahlen() bleiben, die zeigt die
-- Oberfläche auch. Sie sind nicht frei von derselben Logik (wer oft
-- genug abfragt, sieht einen Zähler springen) — das ist im PR und in
-- docs/herkunft-tracking-plan.md als offener Punkt benannt und braucht
-- eine Produktentscheidung (k-Schwelle, gröbere Buckets, oder den
-- created_at-Grant aus 0034 verengen). Diese Migration nimmt nur das
-- weg, was ohne jede Abwägung wegkann: Spalten, die niemand liest.
--
-- drop + create statt create or replace, weil sich der Rückgabetyp
-- ändert; das kann replace nicht.
-- ---------------------------------------------------------------------
drop function if exists public.creator_verlauf(integer);

create function public.creator_verlauf(p_tage integer default 30)
returns table (
  code text,
  tag date,
  klicks integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with grenzen as (
    -- Eingabe des Aufrufers, hart begrenzt: ohne das erzeugte p_tage =
    -- 100000 eine Reihe von hunderttausend Zeilen pro Code.
    select greatest(least(coalesce(p_tage, 30), 90), 1) as tage
  ),
  erlaubt as (
    select l.code
    from public.creator_links l
    where
      l.creator_user_id = (select auth.uid())
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.is_moderator = true
      )
  ),
  tage as (
    select generate_series(
      current_date - ((select tage from grenzen) - 1),
      current_date,
      interval '1 day'
    )::date as tag
  )
  select
    e.code,
    t.tag,
    coalesce(k.klicks, 0)
  from erlaubt e
  cross join tage t
  left join public.creator_klicks k on k.code = e.code and k.tag = t.tag
  order by e.code, t.tag;
$$;

comment on function public.creator_verlauf(integer) is
  'Aufrufe je Creator-Code und Tag fuer den Aufrufer: eigene Codes, als Moderator alle. Gibt seit 0094 NUR Aufrufe zurueck — Registrierungen und Abos pro Tag verrieten bei kleinen Zahlen den Tag eines einzelnen Kontos, was der Datenschutzerklaerung widerspricht. Gesamtzahlen stehen in creator_kennzahlen().';

-- Grants neu setzen: drop hat die alte ACL mitgenommen. Wie in 0093
-- ausdrücklich auch von anon entziehen — revoke from public erreicht den
-- direkten Grant aus Supabases Default Privileges nicht.
revoke execute on function public.creator_verlauf(integer) from public;
revoke execute on function public.creator_verlauf(integer) from anon;
grant execute on function public.creator_verlauf(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 2. handle_new_user: die Zusicherung aus 0088 auch einlösen
--
-- 0088 schreibt im Kommentar: "Eine Registrierung darf niemals an der
-- Herkunftsmessung scheitern." Der Wert des Codes kann das auch nicht
-- (unbekannt/inaktiv/fehlend überspringt den Block). Alles andere schon:
-- die Funktion hängt an einem AFTER INSERT auf auth.users, und was sie
-- wirft, bricht die Registrierung ab — der Nutzer bekommt von GoTrue
-- einen 500.
--
-- Der erreichbare Fall heute ist schmal, aber echt: zwischen dem
-- exists()-Test auf creator_links und dem insert in
-- registrierung_herkunft liegt kein Lock auf der Elternzeile. Löscht die
-- Moderation in diesem Fenster einen noch unbenutzten Code, wirft der
-- Fremdschlüssel 23503 — und "on conflict do nothing" fängt das nicht,
-- das gilt nur für Unique-Verletzungen. Er wird breiter, sobald an einer
-- der beiden Tabellen eine NOT-NULL-Spalte ohne Default, ein CHECK oder
-- ein Trigger dazukommt.
--
-- Deshalb der eigene Block mit exception: er rollt nur seine eigene
-- Arbeit zurück, das Profil darüber bleibt stehen, und die Registrierung
-- läuft durch. Genau die Semantik, die der Satz oben beschreibt.
--
-- Körper sonst unverändert aus 0088 übernommen (vorher aus der Datenbank
-- zurückgelesen und verglichen — ein create or replace auf eine lebende
-- Funktion setzt sonst still etwas zurück).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
-- pg_temp mit angepinnt, wie es 0073 für alle anderen Funktionen
-- verlangt; 0088 hatte die Zeile unverändert aus 0001 übernommen.
security definer set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');

  v_code := new.raw_user_meta_data ->> 'herkunft_code';

  -- raw_user_meta_data ist client-setzbar: supabase.auth.signUp({ options:
  -- { data } }) geht auch aus dem Browser-Client, an jeder Prüfung in
  -- lib/actions/auth.ts vorbei. Der Wert ist damit ein Vorschlag, keine
  -- Tatsache. Ohne die Prüfung hier könnte jeder beliebige Codes erfinden
  -- und die Zahlen eines Creators fluten. Nur ein tatsächlich vergebener,
  -- aktiver Code zählt.
  if v_code is not null and exists (
    select 1 from public.creator_links where code = v_code and aktiv
  ) then
    begin
      insert into public.registrierung_herkunft (user_id, code)
      values (new.id, v_code)
      on conflict do nothing;

      insert into public.creator_konversionen
        (code, art, user_id, ereignis_am, registriert_am)
      values (v_code, 'registrierung', new.id, now(), now())
      on conflict do nothing;
    exception
      when others then
        -- Bewusst alles: was hier schiefgeht, ist eine verlorene Zählung.
        -- Eine verlorene Registrierung wäre teurer als jede Statistik.
        raise warning 'Herkunft fuer % konnte nicht erfasst werden: %', new.id, sqlerrm;
    end;
  end if;

  -- Ein unbekannter, deaktivierter oder fehlender Code führt zu NICHTS —
  -- ausdrücklich nicht zu einem Fehler.
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Legt bei jeder Neuregistrierung das Profil an und haelt seit 0088 zusaetzlich die Creator-Herkunft fest, sofern raw_user_meta_data.herkunft_code einen aktiven Code aus creator_links nennt. Der Code wird hier geprueft, weil die Metadaten client-setzbar sind. Seit 0094 kann die Herkunftserfassung die Registrierung nicht mehr abbrechen.';

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Index für die Tagesabfrage
--
-- creator_kennzahlen() zählt je Code und Art; dafür reicht der Index aus
-- 0088. Heute filtert nichts mehr über die Zeit — der Tagesverlauf oben
-- liest nur noch creator_klicks —, der Index ist also reine Vorsorge für
-- die erste Auswertung, die ein Attributionsfenster rechnet.
--
-- Damit er dann auch greift, muss diese Auswertung einen halboffenen
-- Bereich auf ereignis_am schreiben:
--
--   where ereignis_am >= :von and ereignis_am < :bis
--
-- und NICHT `ereignis_am::date = :tag`. Der Cast macht aus der Spalte
-- einen Ausdruck, und ein B-Tree auf der Spalte kann dafür nicht benutzt
-- werden; es bräuchte einen Ausdrucksindex, der genau denselben Cast
-- trägt. Steht hier, weil die Abfrage später jemand anders schreibt.
-- ---------------------------------------------------------------------
create index if not exists creator_konversionen_code_art_zeit
  on public.creator_konversionen (code, art, ereignis_am);
