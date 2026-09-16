-- dauer_quelle in public_fahrten, damit das Verifiziert-Abzeichen auch an
-- fremden Fahrten steht.
--
-- 0096 hat die Spalte auf route_completions angelegt und 0098 ihr die
-- Bedeutung gegeben, aber kein Lesepfad holte sie. Die Fahrt-Detailseite hat
-- zwei davon (lib/completions.ts -> getCompletionDetail): die eigene Fahrt
-- kommt per select('*') direkt aus route_completions und traegt die Spalte
-- schon; jede fremde oeffentliche Fahrt kommt aus dieser View und trug sie
-- nicht. Ohne diese Migration saehe man das Abzeichen nur an den eigenen
-- Fahrten — also genau dort, wo es am wenigsten aussagt.
--
-- Die Spalte haengt hinten an. create or replace view erlaubt genau das:
-- anhaengen ja, umsortieren oder entfernen nein. Die uebrige Definition ist
-- Wort fuer Wort die aus 0070; wer sie aendert, muss sie dort lesen und nicht
-- hier raten.
--
-- Keine Rechteaenderung: die View behaelt ihre Grants, weil create or replace
-- sie nicht anfasst. dauer_quelle ist kein schuetzenswerter Wert — sie sagt
-- aus, ob eine Zeit serverseitig beobachtet wurde, und genau das soll oeffentlich
-- sein. Der Wert selbst ist ohnehin schon indirekt oeffentlich: seit 0096
-- fuehrt route_leaderboard ausschliesslich Zeilen mit dauer_quelle = 'server'.

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
  rc.hoehenmeter_aufstieg,
  rc.dauer_quelle
from public.route_completions rc
join public.profiles p on p.id = rc.user_id
left join public.routes r on r.id = rc.route_id
left join public.vehicles v on v.id = rc.fahrzeug_id
where rc.ist_oeffentlich = true
  and (
    (rc.art = 'frei' and rc.route_id is null)
    or (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
  );
