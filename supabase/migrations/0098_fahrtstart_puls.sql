-- Pulsschlaege: die Uhr laesst sich nicht mehr mitten in der Fahrt anhalten.
--
-- Was 0096 offen liess. fahrt_start_einloesen friert die Dauer beim ERSTEN
-- Aufruf ein, und nichts band diesen Aufruf an das Ende der Fahrt. Gemessen
-- an der Produktionsdatenbank (Zeile danach geloescht): ein Ticket, zwoelf
-- Sekunden nach dem Anlegen eingeloest, trug dauer_sekunden = 12. Das
-- Geheimnis liegt im Tracking-Snapshot des Browsers, die Funktion ist per
-- PostgREST erreichbar — wer sein eigenes Ticket mitten in der Fahrt
-- einloest und danach zu Ende faehrt, behauptet jede Dauer, die das
-- 200-km/h-Band aus 0059 passieren laesst. Fuer eine 10-km-Strecke ist das
-- alles ab 180 Sekunden. Damit war die x0.4-Faelschung aus A1 Bein 2 weiter
-- moeglich, ohne einen einzigen Zeitstempel anzufassen.
--
-- Der Kern des Problems: die Dauer hing am Zeitpunkt des Einloesens, und den
-- waehlt der Client. Ab hier haengt sie am letzten Puls — einer vom Server
-- gestempelten Positionsmeldung —, und der Trigger verlangt, dass dieser
-- letzte Puls am ENDE des eingereichten Tracks liegt. Wer frueher aufhoert
-- zu pulsen, reicht einen Track ein, dessen Ende nicht zum letzten Puls
-- passt, und faellt auf dauer_quelle = 'trail' zurueck.
--
-- Was das NICHT ist: ein Beweis, dass die Fahrt stattgefunden hat. Die
-- Position im Puls kommt vom Client wie jeder GPS-Fix. Wer faelschen will,
-- muss die Fahrt jetzt aber in Echtzeit simulieren — mit serverseitig
-- gestempelter Taktung ueber die volle Dauer — statt eine aufgezeichnete
-- Datei nachtraeglich zu stauchen. Aus einer Dateibearbeitung wird ein
-- laufender Prozess. Das ist die ehrliche Beschreibung dessen, was hier
-- gewonnen wird; "geschlossen" waere es erst mit einer Quelle, die der
-- Client nicht stellt, und die gibt es auf einem Telefon nicht.

alter table public.fahrt_starts
  add column if not exists letzter_puls_am timestamptz,
  add column if not exists letzter_puls_punkt geography(Point, 4326),
  add column if not exists puls_anzahl integer not null default 0;

comment on column public.fahrt_starts.letzter_puls_am is
  'Serverzeit des letzten Pulses. Die gewertete Dauer ist letzter_puls_am - gestartet_am.';
comment on column public.fahrt_starts.letzter_puls_punkt is
  'Position des letzten Pulses. Der Trigger verlangt, dass sie am Ende des eingereichten Tracks liegt.';

-- --------------------------------------------------------------------------
-- Puls
-- --------------------------------------------------------------------------
-- SECURITY DEFINER aus demselben Grund wie die beiden Funktionen aus 0096:
-- die Tabelle ist fuer niemanden direkt schreibbar, und ein Gast hat keine
-- Sitzung, an der eine Policy ansetzen koennte. Ausgewiesen wird sich ueber
-- das Geheimnis, nicht ueber auth.uid().
--
-- Gibt true zurueck, wenn der Puls angekommen ist. Der Client wertet das
-- nicht aus: ein verlorener Puls ist kein Fehler, er verkuerzt nur das
-- Fenster, in dem die Fahrt noch wertbar ist.
create or replace function public.fahrt_start_puls(
  p_id uuid,
  p_abdruck text,
  p_lat double precision,
  p_lng double precision
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_treffer integer;
begin
  if p_abdruck is null or p_abdruck !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  -- Unbrauchbare Koordinaten gar nicht erst festhalten: ein NULL-Punkt oder
  -- eine Null-Insel-Position wuerde spaeter im Trigger als "passt nicht zum
  -- Trackende" erscheinen und die Fahrt still entwerten. Lieber den Puls
  -- verwerfen und den vorherigen stehen lassen.
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    return false;
  end if;

  update public.fahrt_starts
     set letzter_puls_am = now(),
         letzter_puls_punkt = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
         puls_anzahl = puls_anzahl + 1
   where id = p_id
     and geheimnis_abdruck = p_abdruck
     -- Nach dem Einloesen steht die Dauer fest; ein spaeterer Puls duerfte
     -- sie nicht mehr verschieben.
     and verbraucht_am is null
     and gestartet_am > now() - interval '24 hours'
     -- Schreibbremse je Ticket. Der Client pulst alle 20 Sekunden; alles
     -- Dichtere ist ein Skript. Ohne diese Zeile waere die Funktion ein
     -- unbegrenzter UPDATE-Generator auf eine einzelne Zeile, erreichbar
     -- mit dem oeffentlichen anon-Schluessel.
     and (letzter_puls_am is null or letzter_puls_am < now() - interval '5 seconds');

  get diagnostics v_treffer = row_count;
  return v_treffer > 0;
end;
$$;

revoke execute on function public.fahrt_start_puls(uuid, text, double precision, double precision)
  from public, anon, authenticated;
-- Ausdruecklich beide Rollen: Gaeste zeichnen auf, also pulsen sie auch.
-- Die Falle aus 0047/0048/0091/0096 ist, sich auf revoke-from-public zu
-- verlassen; deshalb hier erst voller Entzug, dann gezielter Grant.
grant execute on function public.fahrt_start_puls(uuid, text, double precision, double precision)
  to anon, authenticated;

-- --------------------------------------------------------------------------
-- Einloesen: Dauer aus dem letzten Puls statt aus dem Einloese-Zeitpunkt
-- --------------------------------------------------------------------------
-- Der ganze Unterschied steht in einer Zeile: greatest(1, letzter_puls_am -
-- gestartet_am) statt greatest(1, now() - gestartet_am). Damit ist der
-- Zeitpunkt des Einloesens fuer die Dauer bedeutungslos — frueh einloesen
-- bringt nichts mehr, spaet einloesen kostet nichts.
--
-- Ohne Puls gibt es keine serverseitige Dauer und damit keine Wertung
-- (Rueckgabe NULL, dauer_quelle = 'trail'). Das ist strenger als 0096, wo
-- ein Ticket ohne jeden Puls noch now() - gestartet_am ergab — eine Zahl,
-- die niemand beobachtet hat.
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
  if v_uid is null then
    return null;
  end if;

  update public.fahrt_starts
     set verbraucht_am = coalesce(verbraucht_am, now()),
         dauer_sekunden = coalesce(
           dauer_sekunden,
           case
             when letzter_puls_am is null then null
             else greatest(1, extract(epoch from (letzter_puls_am - gestartet_am))::integer)
           end
         ),
         eingeloest_von = coalesce(eingeloest_von, v_uid)
   where id = p_id
     and geheimnis_abdruck = p_abdruck
     and (user_id is null or user_id = v_uid)
     and (eingeloest_von is null or eingeloest_von = v_uid)
     and (dauer_sekunden is not null
          or gestartet_am > now() - interval '24 hours')
  returning dauer_sekunden into v_sekunden;

  return v_sekunden;
end;
$$;

revoke execute on function public.fahrt_start_einloesen(uuid, text) from public, anon;
grant execute on function public.fahrt_start_einloesen(uuid, text) to authenticated;

-- --------------------------------------------------------------------------
-- Trigger: der letzte Puls muss am Ende des Tracks liegen
-- --------------------------------------------------------------------------
-- Das ist die Zeile, die frueh Aufhoeren wertlos macht. Wer bei Kilometer
-- vier aufhoert zu pulsen und bis Kilometer zehn weiterfaehrt, reicht einen
-- Track ein, dessen Ende sechs Kilometer vom letzten Puls entfernt liegt.
--
-- Die Toleranz von 500 Metern ist kein Sicherheitspuffer, sondern der Preis
-- fuer verlorene Pulse: geht der Schlusspuls im Funkloch verloren, zaehlt
-- der letzte davor, und der ist bis zu einem Pulsintervall (20 Sekunden)
-- alt — bei 90 km/h also rund 500 Meter zurueck. Enger waere ehrlicher
-- gegenueber der Rangliste und unehrlicher gegenueber der Fahrerin, deren
-- Fahrt dann still ihre Wertung verliert; das Audit nennt genau diesen
-- Tausch und entscheidet ihn zugunsten der echten Fahrt. Was ein Angreifer
-- damit gewinnt, ist das letzte halbe Kilometer einer Strecke — auf zehn
-- Kilometern rund fuenf Prozent statt der sechzig aus der x0.4-Faelschung.
create or replace function public.enforce_route_completion_dauer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start public.fahrt_starts%rowtype;
  v_toleranz_m constant double precision := 500;
begin
  if new.fahrt_start_id is null then
    new.dauer_quelle := 'trail';
    return new;
  end if;

  select * into v_start
    from public.fahrt_starts
   where id = new.fahrt_start_id;

  -- Unbekanntes, nicht eingeloestes oder fremdes Ticket: Herabstufung, keine
  -- Ablehnung. Eine echte Fahrt wegzuwerfen waere der groessere Schaden.
  if v_start.id is null
     or v_start.verbraucht_am is null
     or v_start.dauer_sekunden is null
     or v_start.eingeloest_von is distinct from new.user_id then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    return new;
  end if;

  -- Ohne Puls oder ohne Track gibt es nichts gegeneinander zu halten.
  -- (Drei der dreizehn bestehenden Fahrten tragen track = NULL; solche
  -- Zeilen bleiben unwertbar, was sie vorher auch waren.)
  if v_start.letzter_puls_punkt is null or new.track is null then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    return new;
  end if;

  -- track ist geography(LineString,4326): st_distance rechnet in Metern,
  -- st_endpoint braucht geometry.
  if st_distance(
       v_start.letzter_puls_punkt,
       st_endpoint(new.track::geometry)::geography
     ) > v_toleranz_m then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    return new;
  end if;

  new.dauer_quelle := 'server';
  new.dauer_sekunden := v_start.dauer_sekunden;
  return new;
end;
$$;

revoke execute on function public.enforce_route_completion_dauer() from public, anon, authenticated;

-- Trigger neu setzen, damit die ersetzte Funktion sicher haengt (create or
-- replace function allein genuegt zwar, aber der drop/create macht die
-- Reihenfolge im Katalog nachpruefbar).
drop trigger if exists enforce_route_completion_dauer on public.route_completions;
create trigger enforce_route_completion_dauer
  before insert or update on public.route_completions
  for each row execute function public.enforce_route_completion_dauer();
