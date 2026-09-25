-- =====================================================================
-- 0150 — public_fahrten: Spalte ist_abschnitt
-- =====================================================================
--
-- Vorbereitung für 0151 (Streckenabschnitte folgen der Sichtbarkeit ihrer
-- Fahrt). Ein erkannter Streckenabschnitt einer freien Fahrt ist eine eigene
-- Zeile in route_completions (parent_completion_id gesetzt). Bis 0151 war
-- er immer privat und tauchte deshalb nie in public_fahrten auf. Sobald er
-- öffentlich sein kann, stünde er im Feed und auf dem Profil als zweite,
-- eigene Fahrt neben der Fahrt, aus der er stammt.
--
-- Die View filtert deshalb NICHT selbst: getCompletionDetail
-- (lib/completions.ts) liest die Detailseite einer öffentlichen Fahrt über
-- genau diese View, und ein öffentlicher Abschnitt — verlinkt aus der
-- Bestenliste — soll für andere erreichbar bleiben. Stattdessen trägt die
-- View die Information, und die Listen (Feed, Profil, Profilsuche) filtern.
--
-- Rein additiv: die Spalte hängt am Ende (create or replace view erlaubt
-- kein Umsortieren), Owner-Rechte und Grants bleiben, alter Code liest sie
-- nicht. Körper: pg_get_viewdef vom 2026-09-25, nach 0145.
--
-- Prüfen: select count(*) filter (where ist_abschnitt) from public_fahrten;
-- Rückweg: dieselbe Definition ohne die letzte Spalte (drop + create, da
-- create or replace keine Spalte entfernen kann; Grants neu setzen).

create or replace view public.public_fahrten as
 select rc.user_id,
    rc.route_id,
    r.name as route_name,
    coalesce(r.region, rc.region) as region,
    r.laenge_km,
    rc.datum,
    rc.distanz_km,
    rc.id as completion_id,
    p.display_name,
        case
            when p.zeigt_avatar then p.avatar_url
            else null::text
        end as avatar_url,
    rc.dauer_sekunden,
    rc.foto_url,
    rc.notiz,
    rc.abdeckung_prozent,
        case
            when p.zeigt_fahrzeuge or rc.user_id = auth.uid() then v.typ
            else null::text
        end as fahrzeug_typ,
        case
            when p.zeigt_fahrzeuge or rc.user_id = auth.uid() then v.marke
            else null::text
        end as fahrzeug_marke,
        case
            when p.zeigt_fahrzeuge or rc.user_id = auth.uid() then v.modell
            else null::text
        end as fahrzeug_modell,
    rc.art,
    rc.titel,
    rc.start_ort,
    rc.bewegte_zeit_sekunden,
    rc.hoehenmeter_aufstieg,
    rc.dauer_quelle,
    rc.fuer_follower,
    rc.parent_completion_id is not null as ist_abschnitt
   from route_completions rc
     join profiles p on p.id = rc.user_id
     left join routes r on r.id = rc.route_id
     left join vehicles v on v.id = rc.fahrzeug_id
  where (rc.ist_oeffentlich = true or rc.fuer_follower and fahrt_fuer_follower_sichtbar(rc.user_id))
    and (rc.art = 'frei'::text and rc.route_id is null
         or rc.art = 'strecke'::text and r.status_ok = true and r.ist_privat = false);
