-- =====================================================================
-- Öffentliche Views: Fahrzeug-Sichtbarkeit wiederherstellen und
-- ist_privat nachziehen.
--
-- Befunde N2 und "0060 hat ist_privat nur in einer von vier Views
-- nachgezogen" aus docs/audit/2026-09-07-followup.md.
--
-- A) 0038 D hatte die Fahrzeugspalten in public_fahrten bewusst an
--    zeigt_fahrzeuge gekoppelt:
--
--      case when p.zeigt_fahrzeuge or rc.user_id = auth.uid()
--           then v.typ else null end as fahrzeug_typ
--
--    0045 hat die View per CREATE OR REPLACE neu geschrieben, um die
--    freien Fahrten aufzunehmen — und dabei die Klammer ersatzlos
--    weggelassen. Keine spätere Migration stellt sie wieder her.
--
--    Die View läuft mit den Rechten ihres Owners (kein
--    security_invoker) und ist an anon und authenticated gegrantet
--    (0015). Die RLS-Policy auf vehicles ("Fahrzeuge sichtbar wenn
--    freigegeben", 0015) greift deshalb nicht. Wer zeigt_fahrzeuge auf
--    false gesetzt hat — bis 0054 der Standard — und eine Fahrt teilt,
--    zeigt seit 0045 Typ, Marke und Modell trotzdem jedem, auch
--    abgemeldet: gerendert auf der Fahrtseite und vollständig im Feed,
--    der die View mit select("*") liest. Der Sichtbarkeitsschalter in
--    den Einstellungen sagt dem Nutzer das Gegenteil, und der Kommentar
--    der View behauptet bis heute, die Klammer sei vorhanden.
--
-- B) 0060_private_strecken_aus_oeffentlichen_views.sql zieht
--    r.ist_privat = false in route_leaderboard, route_photos und
--    leaderboard_completions nach und begründet das damit, dass die
--    Grenze "nicht an jedem künftigen Schreibpfad hängen darf". Genau
--    dasselbe Argument gilt für die drei Views hier, die jene Migration
--    nicht anfasst — public_fahrt_tracks liefert dabei den (gekappten)
--    GPS-Track an anon.
--
--    Wichtig: Der Filter gehört ausschliesslich in den STRECKEN-Zweig.
--    Bei einer freien Fahrt ist r über den LEFT JOIN vollständig NULL,
--    ein unbedingtes r.ist_privat = false würde also sämtliche freien
--    Fahrten aus den Views werfen. Dieselbe Falle beschreibt
--    0060:120-126.
--
--    Diese Migration ersetzt jene nicht: route_leaderboard,
--    route_photos und leaderboard_completions bleiben dort offen
--    (Audit-Befund A3, weiterhin nicht eingespielt).
--
-- Mengengerüst: Es verschwinden nur Zeilen, die ist_privat = true UND
-- status_ok = true tragen bzw. deren Besitzer zeigt_fahrzeuge = false
-- gesetzt hat. Die Zeilenzahl wurde NICHT erhoben — diese Migration
-- entsteht ohne Datenbankzugriff. Vor dem Einspielen zählen:
--
--   select count(*) from public.routes
--    where ist_privat = true and status_ok = true;
--
--   select count(*) from public.public_fahrten f
--    join public.profiles p on p.id = f.user_id
--    where f.fahrzeug_typ is not null and p.zeigt_fahrzeuge = false;
--
-- Die zweite Zahl ist die Menge der Fahrten, bei denen bisher gegen den
-- Willen des Nutzers ein Fahrzeug sichtbar war.
-- =====================================================================

-- ---------------------------------------------------------------------------
-- A + B) public_fahrten
--        Spaltenliste und Reihenfolge unverändert gegenüber 0045 —
--        CREATE OR REPLACE VIEW erlaubt kein Umsortieren, und die
--        abhängige View leaderboard_user_totals hängt daran.
-- ---------------------------------------------------------------------------
create or replace view public.public_fahrten as
select
  rc.user_id,
  rc.route_id,
  r.name as route_name,
  coalesce(r.region, rc.region) as region,
  r.laenge_km,
  rc.datum,
  rc.distanz_km,
  rc.id as completion_id,
  p.display_name,
  case when p.zeigt_avatar then p.avatar_url else null end as avatar_url,
  rc.dauer_sekunden,
  rc.foto_url,
  rc.notiz,
  rc.abdeckung_prozent,
  case when p.zeigt_fahrzeuge or rc.user_id = auth.uid() then v.typ else null end as fahrzeug_typ,
  case when p.zeigt_fahrzeuge or rc.user_id = auth.uid() then v.marke else null end as fahrzeug_marke,
  case when p.zeigt_fahrzeuge or rc.user_id = auth.uid() then v.modell else null end as fahrzeug_modell,
  rc.art,
  rc.titel,
  rc.start_ort,
  rc.bewegte_zeit_sekunden,
  rc.hoehenmeter_aufstieg
from public.route_completions rc
join public.profiles p on p.id = rc.user_id
left join public.routes r on r.id = rc.route_id
left join public.vehicles v on v.id = rc.fahrzeug_id
where rc.ist_oeffentlich = true
  and (
    (rc.art = 'frei' and rc.route_id is null)
    or (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
  );

comment on view public.public_fahrten is
  'Oeffentliche Fahrten fuer Feed, Profil und Fahrt-Detailseite, laeuft bewusst mit den Rechten des View-Owners (bypasst RLS). Der Streckenteil ist an status_ok UND ist_privat = false gebunden (0070), der freie Teil ausdruecklich an art = ''frei'' und route_id is null — ein LEFT JOIN ohne diese Kopplung wuerde Fahrten auf unfreigegebenen oder privaten Strecken als freie Fahrten durchlassen; aus demselben Grund steht der ist_privat-Filter nur im Streckenzweig, weil r bei freien Fahrten NULL ist. Fahrzeugdaten respektieren zeigt_fahrzeuge (0015) ausser fuer den Besitzer selbst — in 0038 eingefuehrt, von 0045 versehentlich entfernt, mit 0070 wiederhergestellt. Der rohe GPS-Track ist hier bewusst NICHT enthalten, nur die gekappte Fassung in public_fahrt_tracks.';

-- ---------------------------------------------------------------------------
-- B) public_fahrt_tracks — liefert den gekappten Track an anon.
-- ---------------------------------------------------------------------------
create or replace view public.public_fahrt_tracks as
select
  rc.id as completion_id,
  ST_AsGeoJSON(rc.track_oeffentlich)::json as track_geojson
from public.route_completions rc
left join public.routes r on r.id = rc.route_id
where rc.ist_oeffentlich = true
  and rc.track_oeffentlich is not null
  and (
    (rc.art = 'frei' and rc.route_id is null)
    or (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
  );

comment on view public.public_fahrt_tracks is
  'Gekappter GPS-Track einer oeffentlichen Fahrt. Laeuft mit den Rechten des View-Owners (bypasst RLS) und liefert ausschliesslich track_oeffentlich — der rohe track bleibt dem Besitzer vorbehalten (fahrt_tracks, security_invoker). Sichtbarkeitsregel identisch zu public_fahrten, seit 0070 inklusive ist_privat = false im Streckenzweig.';

-- ---------------------------------------------------------------------------
-- B) public_completion_photos
--
--    Hier steht der Filter unbedingt, nicht im Zweig: Diese View hat
--    seit 0038 einen INNER JOIN auf routes, freie Fahrten sind also
--    ohnehin nicht enthalten. Dass dieser INNER JOIN die Fotos freier
--    Fahrten verschluckt, ist ein eigener, bekannter Befund (F4 im
--    Audit vom 2026-09-06) — ihn zu beheben würde Fotos sichtbar
--    machen, die es heute nicht sind, und ist damit eine
--    Produktentscheidung. Bewusst nicht Teil dieser Migration.
-- ---------------------------------------------------------------------------
create or replace view public.public_completion_photos as
select
  cp.id,
  cp.completion_id,
  cp.foto_url,
  cp.position,
  p.display_name
from public.completion_photos cp
join public.route_completions rc on rc.id = cp.completion_id
join public.routes r on r.id = rc.route_id
join public.profiles p on p.id = cp.user_id
where rc.ist_oeffentlich = true
  and r.status_ok = true
  and r.ist_privat = false
order by cp.position asc;

comment on view public.public_completion_photos is
  'Alle Fotos einer einzelnen oeffentlichen Fahrt, fuer die Fotos-Sektion auf app/fahrten/[id]/page.tsx (nicht-Besitzer-Pfad). Laeuft bewusst mit den Rechten des View-Owners (bypasst RLS), gefiltert auf ist_oeffentlich = true, r.status_ok = true und seit 0070 zusaetzlich r.ist_privat = false. Der INNER JOIN auf routes schliesst freie Fahrten aus — bekannter Befund F4 des Audits vom 2026-09-06, hier bewusst unveraendert gelassen, weil eine Korrektur Fotos sichtbar machen wuerde, die es heute nicht sind.';
