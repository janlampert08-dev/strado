-- Nacharbeit zu 0096: fahrt_start_einloesen war fuer anon ausfuehrbar.
--
-- 0096 schreibt in seinem eigenen Kommentar, dass Supabase jeder neuen
-- Funktion in public eine DIREKTE Ausfuehrungsberechtigung fuer anon und
-- authenticated mitgibt, und dass ein "revoke ... from public" die nicht
-- anfasst — dieselbe Falle wie 0047, 0048 und 0091. Dann tut es genau das:
--
--   revoke execute on function public.fahrt_start_einloesen(uuid, text) from public;
--   grant  execute on function public.fahrt_start_einloesen(uuid, text) to authenticated;
--
-- Ein grant an authenticated entfernt den Grant an anon nicht. Gemessen am
-- Katalog nach dem Einspielen von 0096:
--   has_function_privilege('anon', 'fahrt_start_einloesen(uuid,text)', 'EXECUTE') = true
-- Vierte Wiederholung derselben Falle. AGENTS.md verlangt deshalb, die Rollen
-- ausdruecklich zu benennen — so wie 0088 es fuer die Sequenz tut.
--
-- Was der Grant ermoeglichte: auth.uid() ist fuer anon NULL, also setzte
-- fahrt_start_einloesen eingeloest_von auf NULL statt auf ein Konto. Wer
-- Ticket-ID und Geheimnis kennt, konnte ein fremdes Ticket damit entwerten —
-- der Trigger enforce_route_completion_dauer verlangt
-- eingeloest_von = new.user_id und stuft sonst auf 'trail' herab. Die Fahrt
-- ginge nicht verloren, ihre Ranglistenwertung schon.
--
-- Gemessen, nicht vermutet: ein Aufruf mit auth.uid() = NULL hat ein frisches
-- Ticket eingeloest und die Zeile mit eingeloest_von = NULL zurueckgelassen.
-- Die Testzeile wurde danach geloescht.

revoke execute on function public.fahrt_start_einloesen(uuid, text) from anon;

-- Guertel und Hosentraeger: der Grant oben ist das eine, eine Funktion, die
-- ohne Sitzung ueberhaupt etwas tut, das andere. Sollte ein spaeterer
-- "grant execute ... to anon" (oder ein Supabase-Default bei einem
-- create or replace) den Entzug wieder aufheben, faellt der Aufruf hier
-- trotzdem durch, statt ein Ticket still zu entwerten.
--
-- Zusaetzlich: ein Ticket, das einem ANGEMELDETEN Konto gehoert, darf nur
-- dieses Konto einloesen. Gasttickets (user_id is null) bleiben fuer jedes
-- Konto einloesbar — das ist der Fall, fuer den die Tabelle user_id
-- ueberhaupt nullable haelt: wer abgemeldet aufzeichnet und sich erst beim
-- Speichern anmeldet, soll seine Zeit behalten.
create or replace function public.fahrt_start_einloesen(
  p_id uuid,
  p_abdruck text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sekunden integer;
  v_uid uuid := auth.uid();
begin
  -- Ohne Sitzung gibt es nichts einzuloesen. Gespeichert wird eine Fahrt
  -- ohnehin erst mit Konto; ein Aufruf ohne Sitzung kann deshalb nur ein
  -- Versehen oder ein Entwertungsversuch sein.
  if v_uid is null then
    return null;
  end if;

  update public.fahrt_starts
     set verbraucht_am = coalesce(verbraucht_am, now()),
         dauer_sekunden = coalesce(
           dauer_sekunden,
           greatest(1, extract(epoch from (now() - gestartet_am))::integer)
         ),
         eingeloest_von = coalesce(eingeloest_von, v_uid)
   where id = p_id
     and geheimnis_abdruck = p_abdruck
     -- Fremdes angemeldetes Ticket: nicht einloesbar. NULL heisst Gastticket
     -- und bleibt offen.
     and (user_id is null or user_id = v_uid)
     -- Ein fremdes Konto darf ein bereits eingeloestes Ticket nicht lesen.
     and (eingeloest_von is null or eingeloest_von = v_uid)
     -- Die Altersgrenze gilt nur fuer den ERSTEN Stempel; danach darf
     -- dasselbe Konto die festgehaltene Zahl auch spaeter noch abholen
     -- (Wiederholversuch nach einem gescheiterten Speichern).
     and (dauer_sekunden is not null
          or gestartet_am > now() - interval '24 hours')
  returning dauer_sekunden into v_sekunden;

  return v_sekunden;
end;
$$;

-- Nach jedem create or replace erneut, weil Supabase die Defaults dabei
-- frisch vergibt. Ausdruecklich beide Rollen benannt.
revoke execute on function public.fahrt_start_einloesen(uuid, text) from public, anon;
grant execute on function public.fahrt_start_einloesen(uuid, text) to authenticated;
