-- 0131: Verifizierte Zeiten verlangen eine plausible Puls-Historie.
--
-- Befund (Sicherheitsaudit 2026-09-25). Eine "verifizierte" Zeit
-- (dauer_quelle = 'server', die einzige, die route_leaderboard zeigt) liess
-- sich mit vier Aufrufen herstellen, ohne die Strecke je zu fahren:
--   1. fahrt_start_anlegen            -> Ticket
--   2. fahrt_start_puls am Startpunkt -> erster Puls
--   3. X Sekunden warten, fahrt_start_puls am Endpunkt
--   4. Fahrt mit einem selbst gebauten Track einfuegen (Start/Ende passend)
-- Der Trigger enforce_route_completion_dauer verglich nur den letzten Puls
-- (bei Abschnitten: ersten und letzten) mit den Enden des Tracks — und den
-- Track liefert der Client. Ob dazwischen ueberhaupt Pulse lagen, ob sie auf
-- der Strecke lagen oder ob die Position zwischen zwei Pulsen springt, hat
-- niemand angesehen. Ergebnis: X steht als verifizierte Bestzeit in der
-- Rangliste, gedeckelt nur durch das 200-km/h-Band aus 0059.
--
-- Was sich aendert: Bevor eine Zeit 'server' wird, prueft die neue Funktion
-- fahrt_pulse_pruefen die Pulse im gewerteten Fenster gegen fuenf Regeln
-- (unten). Faellt eine durch, wird die Zeit HERABGESTUFT (dauer_quelle =
-- 'trail'), nie abgelehnt: die Fahrt bleibt mit allem gespeichert, sie steht
-- nur nicht in der Rangliste. Eine echte Fahrt wegzuwerfen waere der
-- groessere Schaden (dieselbe Abwaegung wie 0096/0098). Der Grund steht neu
-- in route_completions.dauer_herabstufung, damit sich Fehlalarme an echten
-- Fahrten zaehlen lassen, statt vermutet zu werden.
--
-- Was das NICHT ist, ehrlich wie in 0098: ein Beweis. Die Positionen kommen
-- weiterhin vom Client. Wer ein Skript schreibt, das in Echtzeit alle 15 s
-- eine Position entlang der (oeffentlichen) Streckengeometrie meldet,
-- kommt durch. Gewonnen ist, dass es dafuer dieses Skript braucht — vier
-- Aufrufe von Hand reichen nicht mehr, Teleportieren kostet die Wertung,
-- und die Strecke muss ueber ihre Laenge abgedeckt sein.
--
-- ---------------------------------------------------------------------------
-- Gemessen (Produktion, 2026-09-25, nur SELECT): 367 Pulse, 11 Tickets seit
-- 0118 (erster Puls 2026-09-20). Fuenf echte Fahrten ab 6 Minuten:
--
--   Ticket    Pulse  Dauer   km   Median-  p90-    groesste  schnellstes
--                                 abstand  abstand Luecke    30-s-Fenster
--   d8ad0510   164  2571 s  31.1   11.1 s  20.9 s  222 s *   133 km/h
--   534db0d3    69   925 s  11.6   11.2 s  20.7 s   21 s      65 km/h
--   490d7dd6    49   797 s   7.7   17.1 s  20.9 s   47 s      62 km/h **
--   bf47c40a    36   643 s   4.2   19.8 s  21.3 s   78 s *    59 km/h
--   6db1e422    30   382 s   5.1   11.0 s  20.3 s   21 s      67 km/h
--
--   *  Alle Luecken ueber 45 s lagen im Stillstand (Verschiebung 8-22 m):
--      der Client pulst aus dem GPS-Handler, und ohne Bewegung entsteht kein
--      neuer Trail-Punkt. Lange Luecken sind also meist Pausen, nicht Tunnel.
--   ** Direkt von Puls zu Puls gemessen zeigt diese echte Fahrt einmal
--      386 km/h (736 m in 6.9 s): die Serverzeit ist die ANKUNFTSzeit, und
--      ein verspaeteter Request staucht den Abstand zum naechsten. Ueber ein
--      Fenster von mindestens 30 s gemessen bleiben es 62 km/h. Deshalb gibt
--      es KEINE Tempo-Pruefung in fahrt_start_puls von Puls zu Puls (sie
--      haette diese Fahrt entwertet), sondern nur die gefensterte unten.
--
-- Die beiden bestehenden verifizierten Abschnitte (534db0d3 auf 12.3 km,
-- 6db1e422 auf 3.1 km): alle Pulse <= 12 m von der Streckengeometrie, 100 %
-- innerhalb 300 m, groesstes nicht abgedecktes Stueck der Strecke 6 % bzw.
-- 9 %. Streckenlaengen (status_ok): 5. Perzentil 9.5 km, Median 22 km.
--
-- Die Regeln und ihre Schwellen (alle bewusst weit ueber dem Gemessenen):
--   R1 mindestens 3 Pulse im Fenster (Start, dazwischen, Ende).
--      -> 'zu_wenige_pulse'
--   R2 Tempo ueber jedes Fenster von >= 30 s (jeder Puls gegen den letzten,
--      der mindestens 30 s aelter ist) hoechstens 250 km/h Luftlinie.
--      Gemessen max. 133 km/h. -> 'sprung'
--   R3 Blinde Zeit: Luecken > 60 s, in denen sich die Position um mehr als
--      1 km verschoben hat (Tunnel, iOS stellt JS im Hintergrund ab), zusammen
--      hoechstens 50 % des Fensters, einzeln hoechstens 15 Minuten
--      (Gotthard-Strassentunnel 16.9 km bei 80 km/h: knapp 13 min).
--      Luecken im Stillstand zaehlen nicht. Gemessen: keine einzige blinde
--      Luecke. -> 'luecke'
--   R4 Mindestens 60 % der Pulse liegen innerhalb 300 m der Referenz
--      (Streckengeometrie aus routes, bei freien Fahrten der Track).
--      Gemessen 100 % innerhalb 12 m. -> 'abseits'
--   R5 Die Pulse decken die Referenz ab: das groesste Stueck ohne Puls
--      (Projektion auf die Linie, beide Enden eingeschlossen) ist hoechstens
--      50 % ihrer Laenge. Gemessen 6-9 %. -> 'strecke_nicht_abgedeckt'
--   R6 75 % der Referenzlaenge (COVERAGE_THRESHOLD_PERCENT) in der gemessenen
--      Pulsspanne ergeben hoechstens 200 km/h — dieselbe Grenze wie 0059,
--      aber gegen die Streckengeometrie des Servers statt gegen distanz_km
--      und Track, die beide der Client liefert. -> 'zu_schnell'
--
-- Die Referenz ist bei Streckenfahrten und Abschnitten die Geometrie aus
-- routes, NICHT der eingereichte Track — genau das war die Luecke.
--
-- Was eine gefaelschte Fahrt jetzt ergibt:
--   * Start-Puls, warten, End-Puls: 2 Pulse -> R1, 'trail'.
--   * Dazu Pulse am Startpunkt "abgesessen": R5 (100 % der Strecke ohne
--     Puls), bei End-Puls binnen 30 s zusaetzlich R2 -> 'trail'.
--   * Pulse an Start, Mitte, Ende im Minutentakt: Sprung ueber > 30 s ist
--     nur unter 250 km/h erlaubt, jede Luecke > 60 s ueber > 1 km ist
--     blind (R3). Wer R2, R3 und R5 zugleich erfuellt, hat die Strecke in
--     Echtzeit nachgestellt — das ist die verbleibende, benannte Grenze.
-- Was eine echte Fahrt mit 5 Minuten Tunnel oder Hintergrund ergibt:
--   * Stillstand (Pause): zaehlt gar nicht als Luecke -> 'server'.
--   * In Bewegung: 300 s blind <= 15 min; <= 50 % der Fahrt, sobald die
--     Fahrt >= 10 min dauert; das Stueck ohne Puls (5 min x 60-80 km/h =
--     5-7 km) <= 50 % der Strecke ab 10-14 km Streckenlaenge; Tempo ueber die
--     Luecke = Fahrtempo -> 'server'. Nur wenn die Luecke mehr als die
--     halbe Strecke oder die halbe Fahrzeit verschluckt, wird herabgestuft —
--     die Fahrt bleibt gespeichert, nur ohne Ranglistenzeit.
--
-- Nachgerechnet vor dem Schreiben (dieselben Abfragen als SELECT gegen die
-- Produktion, Faelschungen synthetisch auf der Geometrie der 12.3-km-Strecke
-- des Abschnitts 534db0d3; ausserdem die Funktion selbst als pg_temp-Kopie
-- in einer zurueckgerollten Transaktion gegen beide echten Abschnitte):
--   echt 534db0d3 (852 s, 63 Pulse)           -> plausibel (server)
--   echt 6db1e422 (182 s, 16 Pulse)           -> plausibel (server)
--   alle 11 Tickets ohne Referenz (R1-R3)     -> plausibel, ausser den drei
--                                                Test-Tickets mit 2 Pulsen
--   534db0d3 ohne Pulse Min. 3-8 (5 min blind, 314 s, 39 % der Strecke
--                                  ohne Puls) -> plausibel (server)
--   534db0d3 ohne Pulse Min. 2-12 (10 min blind in 14 min Fahrt)
--                                             -> 'luecke' (trail)
--   Start, 400 s, Ende                        -> 'zu_wenige_pulse'
--   26 Pulse am Start, dann Ende              -> 'strecke_nicht_abgedeckt'
--   Start, Mitte, Ende je 200 s               -> 'luecke'
--   Skript, alle 15 s entlang der Linie       -> plausibel (die Grenze oben)
--
-- Verhalten bei UPDATE: Aendert ein UPDATE keine wertungsrelevante Spalte
-- (Ticket, Besitzer, Strecke, Elternfahrt, Fenster, Track, Dauer, Quelle),
-- bleibt das Urteil von damals stehen. Nutzer duerfen ohnehin nur
-- ist_oeffentlich, notiz und track_oeffentlich aendern (Spaltengrants);
-- ohne diese Ausnahme wuerde das Umschalten der Sichtbarkeit einer alten
-- Fahrt sie gegen Regeln pruefen, die es bei ihrem Einfuegen nicht gab.
--
-- Unveraendert: fahrt_start_anlegen, fahrt_start_puls, fahrt_start_einloesen
-- und save_free_ride_with_segments (Signaturen und Grants wie live). Die
-- App braucht keinen neuen Code; segment_dauer_einloesen behaelt seine
-- Signatur und gibt bei unplausiblen Pulsen NULL zurueck, was die App schon
-- heute als "trail" behandelt.
--
-- Pruefen nach dem Anwenden:
--   select dauer_quelle, dauer_herabstufung, count(*) from route_completions
--    where created_at > '<Anwendungszeit>' group by 1, 2;
--   -- Stichprobe gegen die gemessenen Tickets (erwartet: alle NULL):
--   select rc.id, public.fahrt_pulse_pruefen(
--            rc.fahrt_start_id,
--            to_timestamp(rc.segment_fenster_von / 1000.0),
--            to_timestamp(rc.segment_fenster_bis / 1000.0),
--            r.geometry)
--     from route_completions rc join routes r on r.id = rc.route_id
--    where rc.dauer_quelle = 'server';
--
-- Zurueckrollen: enforce_route_completion_dauer und segment_dauer_einloesen
-- mit den Koerpern aus 0118 (segment_dauer_einloesen) bzw. dem live
-- gelesenen Koerper vor 0131 (Trigger; entspricht 0118 fuer Abschnitte und
-- 0098 fuer ganze Fahrten) neu anlegen, danach
--   drop function public.fahrt_pulse_pruefen(uuid, timestamptz, timestamptz, geography);
--   alter table public.route_completions drop column dauer_herabstufung;

-- ---------------------------------------------------------------------------
-- 1) Grund der Herabstufung — fuer Auswertung, nicht fuer die Anzeige
-- ---------------------------------------------------------------------------
alter table public.route_completions
  add column if not exists dauer_herabstufung text;

comment on column public.route_completions.dauer_herabstufung is
  'Warum eine Fahrt MIT Fahrtstart-Ticket nicht als server gewertet wurde (0131): ticket_ungueltig, ohne_track_oder_puls, enden_passen_nicht, fenster_ohne_pulse oder ein Code aus fahrt_pulse_pruefen. NULL bei server und bei Fahrten ohne Ticket. Setzt ausschliesslich der Trigger enforce_route_completion_dauer.';

-- ---------------------------------------------------------------------------
-- 2) Die Pruefung
-- ---------------------------------------------------------------------------
-- Gibt NULL zurueck, wenn die Pulse im Fenster plausibel sind, sonst den
-- Code der ersten verletzten Regel. p_referenz NULL ueberspringt R4-R6
-- (segment_dauer_einloesen kennt die Strecke nicht; der Trigger prueft
-- danach mit Strecke und bleibt massgeblich).
--
-- SECURITY DEFINER, weil fahrt_pulse fuer niemanden lesbar ist (0118).
-- Aufgerufen wird sie nur aus dem Trigger und aus segment_dauer_einloesen;
-- fuer anon/authenticated gibt es keinen Grant — sie wuerde sonst verraten,
-- wo ein fremdes Ticket gepulst hat, wenn man dessen ID kennt.
create or replace function public.fahrt_pulse_pruefen(
  p_ticket uuid,
  p_von timestamptz,
  p_bis timestamptz,
  p_referenz geography
) returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  -- Schwellen: Herleitung im Kopf dieser Migration.
  c_min_pulse          constant integer := 3;
  c_tempo_fenster      constant interval := interval '30 seconds';
  c_max_kmh            constant double precision := 250;
  c_blind_ab_s         constant double precision := 60;
  c_blind_ab_m         constant double precision := 1000;
  c_blind_max_s        constant double precision := 900;
  c_blind_max_anteil   constant double precision := 0.5;
  c_nah_m              constant double precision := 300;
  c_nah_min_anteil     constant double precision := 0.6;
  c_loch_max_anteil    constant double precision := 0.5;
  c_abdeckung          constant double precision := 0.75;
  c_schnitt_max_kmh    constant double precision := 200;

  v_n integer;
  v_erster timestamptz;
  v_letzter timestamptz;
  v_dauer_s double precision;
  v_blind_s double precision;
  v_blind_max_s double precision;
  v_max_ms double precision;
  v_linie geometry;
  v_laenge_m double precision;
  v_nah integer;
  v_loch double precision;
begin
  if p_ticket is null or p_von is null or p_bis is null or p_bis <= p_von then
    return 'zu_wenige_pulse';
  end if;

  select count(*), min(puls_am), max(puls_am)
    into v_n, v_erster, v_letzter
    from public.fahrt_pulse
   where ticket_id = p_ticket
     and puls_am >= p_von and puls_am <= p_bis;

  -- R1
  if v_n < c_min_pulse then
    return 'zu_wenige_pulse';
  end if;
  v_dauer_s := extract(epoch from (v_letzter - v_erster));
  if v_dauer_s <= 0 then
    return 'zu_wenige_pulse';
  end if;

  -- R2: Tempo ueber mindestens 30 s. Von Puls zu Puls waere es Rauschen
  -- (Ankunftszeit statt Messzeit, siehe 490d7dd6 im Kopf); ueber 30 s
  -- gleicht sich ein verspaeteter Request mit seinem Nachbarn aus, ein
  -- echter Sprung nicht.
  select max(st_distance(a.punkt, b.punkt)
             / extract(epoch from (a.puls_am - b.puls_am)))
    into v_max_ms
    from public.fahrt_pulse a
    cross join lateral (
      select v.punkt, v.puls_am
        from public.fahrt_pulse v
       where v.ticket_id = p_ticket
         and v.puls_am >= p_von
         and v.puls_am <= a.puls_am - c_tempo_fenster
       order by v.puls_am desc
       limit 1
    ) b
   where a.ticket_id = p_ticket
     and a.puls_am >= p_von and a.puls_am <= p_bis;

  if coalesce(v_max_ms, 0) * 3.6 > c_max_kmh then
    return 'sprung';
  end if;

  -- R3: blinde Zeit. Nur Luecken, ueber die sich die Position deutlich
  -- verschoben hat — eine Pause im Stillstand ist keine Luecke.
  select coalesce(sum(luecke_s), 0), coalesce(max(luecke_s), 0)
    into v_blind_s, v_blind_max_s
    from (
      select extract(epoch from (puls_am - vor_am)) as luecke_s,
             st_distance(punkt, vor_punkt) as weg_m
        from (
          select puls_am, punkt,
                 lag(puls_am) over w as vor_am,
                 lag(punkt) over w as vor_punkt
            from public.fahrt_pulse
           where ticket_id = p_ticket
             and puls_am >= p_von and puls_am <= p_bis
          window w as (order by puls_am)
        ) paare
       where vor_am is not null
    ) luecken
   where luecke_s > c_blind_ab_s
     and weg_m > c_blind_ab_m;

  if v_blind_max_s > c_blind_max_s or v_blind_s > c_blind_max_anteil * v_dauer_s then
    return 'luecke';
  end if;

  if p_referenz is null then
    return null;
  end if;

  -- R4/R5: gegen die Referenzlinie. Die Projektion rechnet in Web-Mercator:
  -- winkeltreu, auf der Laenge einer Strecke also mit ueberall gleichem
  -- Massstab — Anteile entlang der Linie stimmen, was in Grad (Laengengrade
  -- sind in der Schweiz um cos(46.8 Grad) kuerzer) nicht der Fall waere.
  v_linie := st_transform(p_referenz::geometry, 3857);
  v_laenge_m := st_length(p_referenz);
  if v_laenge_m is null or v_laenge_m <= 0 then
    return null;
  end if;

  select count(*),
         greatest(min(f), 1 - max(f), coalesce(max(naechstes - f), 0))
    into v_nah, v_loch
    from (
      select f, lead(f) over (order by f) as naechstes
        from (
          select st_linelocatepoint(v_linie, st_transform(punkt::geometry, 3857)) as f
            from public.fahrt_pulse
           where ticket_id = p_ticket
             and puls_am >= p_von and puls_am <= p_bis
             and st_dwithin(punkt, p_referenz, c_nah_m)
        ) projiziert
    ) sortiert;

  if v_nah < c_nah_min_anteil * v_n then
    return 'abseits';
  end if;

  if v_loch > c_loch_max_anteil then
    return 'strecke_nicht_abgedeckt';
  end if;

  -- R6
  if (c_abdeckung * v_laenge_m) / v_dauer_s * 3.6 > c_schnitt_max_kmh then
    return 'zu_schnell';
  end if;

  return null;
end;
$$;

revoke execute on function public.fahrt_pulse_pruefen(uuid, timestamptz, timestamptz, geography)
  from public, anon, authenticated;

comment on function public.fahrt_pulse_pruefen(uuid, timestamptz, timestamptz, geography) is
  'Plausibilitaet der Pulse eines Fahrtstart-Tickets im Fenster [p_von, p_bis] (0131). NULL = plausibel, sonst Regelcode. Nur fuer enforce_route_completion_dauer und segment_dauer_einloesen.';

-- ---------------------------------------------------------------------------
-- 3) Trigger: live gelesener Koerper (pg_get_functiondef, 2026-09-25),
--    erweitert um die UPDATE-Ausnahme, die Gruende und die Pruefung.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_route_completion_dauer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start public.fahrt_starts%rowtype;
  v_toleranz_m constant double precision := 500;
  v_erster_am timestamptz;
  v_letzter_am timestamptz;
  v_erster_punkt geography(Point, 4326);
  v_letzter_punkt geography(Point, 4326);
  v_referenz geography;
  v_grund text;
begin
  -- Nichts Wertungsrelevantes geaendert: das Urteil vom Einfuegen bleibt.
  -- geography wird ueber den Binaerwert verglichen, weil = auf geography
  -- nur die Bounding Box vergleicht.
  if tg_op = 'UPDATE'
     and new.fahrt_start_id is not distinct from old.fahrt_start_id
     and new.user_id is not distinct from old.user_id
     and new.route_id is not distinct from old.route_id
     and new.parent_completion_id is not distinct from old.parent_completion_id
     and new.segment_fenster_von is not distinct from old.segment_fenster_von
     and new.segment_fenster_bis is not distinct from old.segment_fenster_bis
     and new.dauer_sekunden is not distinct from old.dauer_sekunden
     and new.dauer_quelle is not distinct from old.dauer_quelle
     and st_asbinary(new.track) is not distinct from st_asbinary(old.track) then
    new.dauer_herabstufung := old.dauer_herabstufung;
    return new;
  end if;

  if new.fahrt_start_id is null then
    new.dauer_quelle := 'trail';
    new.dauer_herabstufung := null;
    return new;
  end if;

  select * into v_start
    from public.fahrt_starts
   where id = new.fahrt_start_id;

  -- Referenz fuer die Pulspruefung: die Streckengeometrie des Servers, nur
  -- bei einer freien Fahrt (ohne Strecke) der eingereichte Track.
  if new.route_id is not null then
    select r.geometry into v_referenz
      from public.routes r
     where r.id = new.route_id;
  end if;
  v_referenz := coalesce(v_referenz, new.track);

  if new.parent_completion_id is not null then
    if v_start.id is null
       or v_start.verbraucht_am is null
       or v_start.eingeloest_von is distinct from new.user_id
       or (v_start.user_id is not null and v_start.user_id is distinct from new.user_id)
       or new.segment_fenster_von is null
       or new.segment_fenster_bis is null
       or new.segment_fenster_von >= new.segment_fenster_bis
       or new.track is null then
      new.fahrt_start_id := null;
      new.dauer_quelle := 'trail';
      new.dauer_herabstufung := 'ticket_ungueltig';
      return new;
    end if;

    select min(puls_am), max(puls_am) into v_erster_am, v_letzter_am
      from public.fahrt_pulse
     where ticket_id = new.fahrt_start_id
       and puls_am >= to_timestamp(new.segment_fenster_von / 1000.0)
       and puls_am <= to_timestamp(new.segment_fenster_bis / 1000.0);

    if v_erster_am is null or v_letzter_am is null or v_letzter_am <= v_erster_am then
      new.fahrt_start_id := null;
      new.dauer_quelle := 'trail';
      new.dauer_herabstufung := 'fenster_ohne_pulse';
      return new;
    end if;

    select punkt into v_erster_punkt
      from public.fahrt_pulse
     where ticket_id = new.fahrt_start_id and puls_am = v_erster_am
     limit 1;
    select punkt into v_letzter_punkt
      from public.fahrt_pulse
     where ticket_id = new.fahrt_start_id and puls_am = v_letzter_am
     limit 1;

    if st_distance(
         v_erster_punkt,
         st_startpoint(new.track::geometry)::geography
       ) > v_toleranz_m
       or st_distance(
         v_letzter_punkt,
         st_endpoint(new.track::geometry)::geography
       ) > v_toleranz_m then
      new.fahrt_start_id := null;
      new.dauer_quelle := 'trail';
      new.dauer_herabstufung := 'enden_passen_nicht';
      return new;
    end if;

    v_grund := public.fahrt_pulse_pruefen(
      new.fahrt_start_id,
      to_timestamp(new.segment_fenster_von / 1000.0),
      to_timestamp(new.segment_fenster_bis / 1000.0),
      v_referenz
    );
    if v_grund is not null then
      new.fahrt_start_id := null;
      new.dauer_quelle := 'trail';
      new.dauer_herabstufung := v_grund;
      return new;
    end if;

    new.dauer_quelle := 'server';
    new.dauer_herabstufung := null;
    new.dauer_sekunden := greatest(1, extract(epoch from (v_letzter_am - v_erster_am))::integer);
    return new;
  end if;

  if v_start.id is null
     or v_start.verbraucht_am is null
     or v_start.dauer_sekunden is null
     or v_start.eingeloest_von is distinct from new.user_id then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    new.dauer_herabstufung := 'ticket_ungueltig';
    return new;
  end if;

  if v_start.letzter_puls_punkt is null or new.track is null then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    new.dauer_herabstufung := 'ohne_track_oder_puls';
    return new;
  end if;

  if st_distance(
       v_start.letzter_puls_punkt,
       st_endpoint(new.track::geometry)::geography
     ) > v_toleranz_m then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    new.dauer_herabstufung := 'enden_passen_nicht';
    return new;
  end if;

  -- Ganze Fahrt: das Fenster ist die gewertete Spanne selbst, vom Anlegen
  -- des Tickets bis zum letzten Puls.
  v_grund := public.fahrt_pulse_pruefen(
    new.fahrt_start_id,
    v_start.gestartet_am,
    v_start.letzter_puls_am,
    v_referenz
  );
  if v_grund is not null then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    new.dauer_herabstufung := v_grund;
    return new;
  end if;

  new.dauer_quelle := 'server';
  new.dauer_herabstufung := null;
  new.dauer_sekunden := v_start.dauer_sekunden;
  return new;
end;
$$;

-- Wie live: nur postgres und service_role.
revoke execute on function public.enforce_route_completion_dauer() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) segment_dauer_einloesen: live gelesener Koerper, dazu R1-R3 vor der
--    Rueckgabe. Die Strecke kennt die Funktion nicht (Signatur bleibt, die
--    deployte App ruft sie so auf); R4-R6 prueft der Trigger beim Einfuegen.
--    NULL heisst fuer die App schon heute "trail" (loeseSegmentDauerEin).
-- ---------------------------------------------------------------------------
create or replace function public.segment_dauer_einloesen(
  p_id uuid,
  p_abdruck text,
  p_von_ms bigint,
  p_bis_ms bigint,
  p_start_lng double precision,
  p_start_lat double precision,
  p_end_lng double precision,
  p_end_lat double precision
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.fahrt_starts%rowtype;
  v_erster_am timestamptz;
  v_letzter_am timestamptz;
  v_erster_punkt geography(Point, 4326);
  v_letzter_punkt geography(Point, 4326);
  v_toleranz_m constant double precision := 500;
begin
  if p_abdruck is null or p_abdruck !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  if p_von_ms is null or p_bis_ms is null
     or p_von_ms <= 0 or p_bis_ms <= p_von_ms
     or p_bis_ms - p_von_ms > 86400000 then
    return null;
  end if;

  select * into v_ticket
    from public.fahrt_starts
   where id = p_id
     and geheimnis_abdruck = p_abdruck
     and gestartet_am > now() - interval '24 hours'
     and (user_id is null or user_id = auth.uid());
  if v_ticket.id is null then
    return null;
  end if;

  select min(puls_am), max(puls_am) into v_erster_am, v_letzter_am
    from public.fahrt_pulse
   where ticket_id = p_id
     and puls_am >= to_timestamp(p_von_ms / 1000.0)
     and puls_am <= to_timestamp(p_bis_ms / 1000.0);

  if v_erster_am is null or v_letzter_am is null or v_letzter_am <= v_erster_am then
    return null;
  end if;

  select punkt into v_erster_punkt
    from public.fahrt_pulse
   where ticket_id = p_id and puls_am = v_erster_am
   limit 1;
  select punkt into v_letzter_punkt
    from public.fahrt_pulse
   where ticket_id = p_id and puls_am = v_letzter_am
   limit 1;

  if st_distance(
       v_erster_punkt,
       st_setsrid(st_makepoint(p_start_lng, p_start_lat), 4326)::geography
     ) > v_toleranz_m then
    return null;
  end if;
  if st_distance(
       v_letzter_punkt,
       st_setsrid(st_makepoint(p_end_lng, p_end_lat), 4326)::geography
     ) > v_toleranz_m then
    return null;
  end if;

  if public.fahrt_pulse_pruefen(
       p_id,
       to_timestamp(p_von_ms / 1000.0),
       to_timestamp(p_bis_ms / 1000.0),
       null
     ) is not null then
    return null;
  end if;

  return greatest(1, extract(epoch from (v_letzter_am - v_erster_am))::integer);
end;
$$;

-- Wie live: authenticated (und service_role), nicht anon.
revoke execute on function public.segment_dauer_einloesen(
  uuid, text, bigint, bigint, double precision, double precision, double precision, double precision
) from public, anon;
grant execute on function public.segment_dauer_einloesen(
  uuid, text, bigint, bigint, double precision, double precision, double precision, double precision
) to authenticated;
