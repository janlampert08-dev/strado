-- Pässe als eigene Objekte: Katalog, Passstatus, Sperrkalender, Folgen.
--
-- Bis hierhin kannte Strado nur Strecken. "Pass" war eine Kategorie
-- (kategorien @> '{passstrasse}') und routes.saison_status ein einzelnes
-- Flag, das niemand pflegt. Drei neue Funktionen brauchen den Pass aber als
-- Ding mit eigener Identität, weil ihre Aussage am Pass hängt und nicht an
-- einer Strecke:
--
--   * Der Passstatus ("Sustenpass: Wintersperre") gilt für jede Strecke, die
--     über den Susten führt — auch für eine Rundfahrt, die ihn nur mitnimmt.
--   * Der Kalender (übliche Wintersperre, autofreie Tage, Veranstaltungen)
--     ebenso.
--   * Die Pass-Sammlung zählt Pässe, nicht Strecken: drei Strecken über den
--     Klausen sind ein Stempel, und eine freie Fahrt über den Klausen auch.
--
-- Die Verbindung Strecke ↔ Pass wird deshalb NICHT gepflegt, sondern
-- gerechnet (strecken_paesse unten): eine Strecke führt über einen Pass,
-- wenn ihre Geometrie am Scheitelpunkt vorbeigeht. Eine neu angelegte
-- Strecke hängt damit ohne jeden Handgriff am richtigen Pass, und eine
-- verschobene Geometrie korrigiert die Zuordnung von selbst.
--
-- Datenquelle Katalog: Scheitelpunkte aus OpenStreetMap (Nominatim,
-- class=mountain_pass), signalisierte Passhöhen, jede gegen das
-- swisstopo-Höhenmodell (api3.geo.admin.ch, height) am Scheitelpunkt
-- gegengeprüft — Abweichung bei allen 34 höchstens 4 m. Übliche
-- Wintersperren nach alpen-paesse.ch (IG Alpenpässe), Flüela nach Pro
-- Flüela/Kanton GR, Col de la Croix und Col du Marchairuz nach Kanton Waadt.
-- Die Monate sind "üblich", nicht verbindlich; die App sagt das so.
--
-- Datenquelle Status: die Verkehrsmeldungen des ASTRA
-- (opentransportdata.swiss, DATEX II, Verkehrsmanagementzentrale VMZ-CH und
-- Kantonspolizeien), abgeholt von app/api/cron/passstatus, plus eine
-- Übersteuerung durch Moderatoren. Siehe docs/paesse-plan.md.

-- ---------------------------------------------------------------------------
-- Katalog
-- ---------------------------------------------------------------------------

create table public.paesse (
  -- Lesbarer Schlüssel statt uuid: er steht in URLs (/paesse#susten) und in
  -- Moderationsformularen, und der Katalog wächst nur über Migrationen.
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  hoehe_m integer not null check (hoehe_m between 300 and 3000),
  kantone text[] not null check (
    cardinality(kantone) between 1 and 3
    and kantone <@ array[
      'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE','NW',
      'OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH'
    ]::text[]
  ),
  scheitel geography(Point, 4326) not null,
  -- Übliche Wintersperre als Monatsspanne über den Jahreswechsel
  -- (10 → 5 = Oktober bis Mai). Beide null = ganzjährig befahrbar.
  wintersperre_ab_monat smallint check (wintersperre_ab_monat between 1 and 12),
  wintersperre_bis_monat smallint check (wintersperre_bis_monat between 1 and 12),
  -- Schreibweisen, unter denen der Pass in Verkehrsmeldungen auftaucht.
  -- Bewusst eng: "Gotthard" allein steht in jeder Staumeldung vor dem
  -- Autobahntunnel und fehlt deshalb; lib/passMeldungen.ts verwirft ausserdem
  -- Tunnel- und Autoverlad-Meldungen, deren Treffer kein "Pass"/"Col" trägt.
  suchbegriffe text[] not null check (cardinality(suchbegriffe) >= 1),
  created_at timestamptz not null default now(),
  constraint wintersperre_vollstaendig check (
    (wintersperre_ab_monat is null) = (wintersperre_bis_monat is null)
  )
);

create index paesse_scheitel_idx on public.paesse using gist (scheitel);

alter table public.paesse enable row level security;

create policy "Passkatalog ist öffentlich"
  on public.paesse for select
  to anon, authenticated
  using (true);

-- Supabase vergibt an neue Tabellen volle Rechte an anon/authenticated. Ohne
-- Schreib-Policy greift RLS ohnehin, aber der Katalog ändert sich nur über
-- Migrationen — das soll auch an den Grants ablesbar sein.
revoke insert, update, delete, truncate on public.paesse from anon, authenticated;

insert into public.paesse
  (id, name, hoehe_m, kantone, scheitel, wintersperre_ab_monat, wintersperre_bis_monat, suchbegriffe)
values
  ('umbrail', 'Umbrailpass', 2501, '{GR}', 'SRID=4326;POINT(10.43318 46.54165)', 10, 5, '{Umbrailpass,Umbrail,"Pass Umbrail"}'),
  ('nufenen', 'Nufenenpass', 2478, '{VS,TI}', 'SRID=4326;POINT(8.38783 46.47712)', 10, 5, '{Nufenenpass,Nufenen,"Passo della Novena"}'),
  ('grosser-st-bernhard', 'Grosser St. Bernhard', 2469, '{VS}', 'SRID=4326;POINT(7.17041 45.86905)', 10, 5, '{"Grosser-St.-Bernhard-Pass","Grosser St. Bernhard Pass","Col du Grand-Saint-Bernard","Col du Grand-St-Bernard"}'),
  ('furka', 'Furkapass', 2429, '{UR,VS}', 'SRID=4326;POINT(8.41518 46.57269)', 10, 5, '{Furkapass,Furka,Furkastrasse}'),
  ('flueela', 'Flüelapass', 2383, '{GR}', 'SRID=4326;POINT(9.95028 46.74750)', 12, 4, '{Flüelapass,Flüela,Flüelastrasse}'),
  ('bernina', 'Berninapass', 2328, '{GR}', 'SRID=4326;POINT(10.02760 46.41090)', null, null, '{Berninapass,Bernina,Berninastrasse,"Passo del Bernina"}'),
  ('albula', 'Albulapass', 2315, '{GR}', 'SRID=4326;POINT(9.83768 46.58225)', 10, 5, '{Albulapass,Albula,Albulastrasse}'),
  ('forcola-di-livigno', 'Forcola di Livigno', 2315, '{GR}', 'SRID=4326;POINT(10.05620 46.44082)', 10, 5, '{"Forcola di Livigno",Forcola}'),
  ('julier', 'Julierpass', 2284, '{GR}', 'SRID=4326;POINT(9.72815 46.47221)', null, null, '{Julierpass,Julier,Julierstrasse}'),
  ('susten', 'Sustenpass', 2224, '{BE,UR}', 'SRID=4326;POINT(8.44652 46.72912)', 10, 5, '{Sustenpass,Susten,Sustenstrasse}'),
  ('grimsel', 'Grimselpass', 2164, '{BE,VS}', 'SRID=4326;POINT(8.33770 46.56152)', 10, 5, '{Grimselpass,Grimsel,Grimselstrasse}'),
  ('ofen', 'Ofenpass', 2149, '{GR}', 'SRID=4326;POINT(10.29217 46.63977)', null, null, '{Ofenpass,Ofenpassstrasse,"Pass dal Fuorn"}'),
  ('spluegen', 'Splügenpass', 2113, '{GR}', 'SRID=4326;POINT(9.33034 46.50562)', 10, 5, '{Splügenpass,"Splügen Pass","Passo dello Spluga"}'),
  ('gotthard', 'Gotthardpass', 2106, '{UR,TI}', 'SRID=4326;POINT(8.56115 46.55931)', 10, 5, '{Gotthardpass,Gotthardpassstrasse,Gotthard-Passstrasse,Tremola,"Passo del San Gottardo"}'),
  ('san-bernardino', 'San-Bernardino-Pass', 2065, '{GR}', 'SRID=4326;POINT(9.17114 46.49715)', 10, 5, '{San-Bernardino-Pass,"San Bernardinopass",San-Bernardino-Passstrasse,"Passo del San Bernardino"}'),
  ('oberalp', 'Oberalppass', 2044, '{UR,GR}', 'SRID=4326;POINT(8.67117 46.65874)', 10, 5, '{Oberalppass,Oberalp,Oberalpstrasse}'),
  ('simplon', 'Simplonpass', 2005, '{VS}', 'SRID=4326;POINT(8.03168 46.25021)', null, null, '{Simplonpass,Simplon,Simplonstrasse}'),
  ('klausen', 'Klausenpass', 1948, '{UR,GL}', 'SRID=4326;POINT(8.85544 46.86819)', 10, 5, '{Klausenpass,Klausenstrasse}'),
  ('lukmanier', 'Lukmanierpass', 1915, '{GR,TI}', 'SRID=4326;POINT(8.80100 46.56300)', null, null, '{Lukmanierpass,Lukmanier,Lucomagno,"Passo del Lucomagno"}'),
  ('maloja', 'Malojapass', 1815, '{GR}', 'SRID=4326;POINT(9.69581 46.39994)', null, null, '{Malojapass,"Passo del Maloja"}'),
  ('col-de-la-croix', 'Col de la Croix', 1778, '{VD}', 'SRID=4326;POINT(7.12672 46.32470)', 11, 5, '{"Col de la Croix"}'),
  ('wolfgang', 'Wolfgangpass', 1631, '{GR}', 'SRID=4326;POINT(9.85374 46.83266)', null, null, '{Wolfgangpass}'),
  ('glaubenbielen', 'Glaubenbielen', 1611, '{OW,LU}', 'SRID=4326;POINT(8.09317 46.81881)', 10, 5, '{Glaubenbielen,Glaubenbüelen,Glaubenbielenpass}'),
  ('pragel', 'Pragelpass', 1548, '{SZ,GL}', 'SRID=4326;POINT(8.86950 46.99937)', 10, 5, '{Pragelpass,Pragel}'),
  ('col-du-pillon', 'Col du Pillon', 1546, '{VD,BE}', 'SRID=4326;POINT(7.20460 46.35343)', null, null, '{"Col du Pillon",Pillon}'),
  ('glaubenberg', 'Glaubenbergpass', 1543, '{OW,LU}', 'SRID=4326;POINT(8.10767 46.89246)', 11, 4, '{Glaubenbergpass,Glaubenberg}'),
  ('col-de-la-forclaz', 'Col de la Forclaz', 1527, '{VS}', 'SRID=4326;POINT(7.00135 46.05773)', null, null, '{"Col de la Forclaz"}'),
  ('jaun', 'Jaunpass', 1509, '{BE,FR}', 'SRID=4326;POINT(7.33908 46.59216)', null, null, '{Jaunpass,"Col du Jaun"}'),
  ('col-du-marchairuz', 'Col du Marchairuz', 1447, '{VD}', 'SRID=4326;POINT(6.25029 46.55279)', null, null, '{"Col du Marchairuz",Marchairuz}'),
  ('col-des-mosses', 'Col des Mosses', 1445, '{VD}', 'SRID=4326;POINT(7.10263 46.39898)', null, null, '{"Col des Mosses"}'),
  ('ibergeregg', 'Ibergeregg', 1406, '{SZ}', 'SRID=4326;POINT(8.73321 47.01743)', null, null, '{Ibergeregg,Ibergereggstrasse}'),
  ('vue-des-alpes', 'Vue des Alpes', 1283, '{NE}', 'SRID=4326;POINT(6.86982 47.07272)', null, null, '{"Vue des Alpes",Vue-des-Alpes,"Col de la Vue des Alpes"}'),
  ('sattelegg', 'Sattelegg', 1190, '{SZ}', 'SRID=4326;POINT(8.84682 47.12733)', null, null, '{Sattelegg}'),
  ('bruenig', 'Brünigpass', 1008, '{OW,BE}', 'SRID=4326;POINT(8.13699 46.75686)', null, null, '{Brünigpass,Brünig}');

-- ---------------------------------------------------------------------------
-- Strecke ↔ Pass, gerechnet
-- ---------------------------------------------------------------------------

-- 400 m, weil der OSM-Scheitelpunkt die Passhöhe markiert, nicht die
-- Fahrbahnmitte: am Grimsel und am Gotthard liegt er neben der Strasse, und
-- eine Strecke, die aus Mapbox-Wegpunkten entsteht, weicht in Kehren nochmals
-- ab. Weiter darf es nicht werden — zwei Pässe liegen nirgends so nah
-- beieinander, aber eine Talstrasse unter einer Passhöhe schon.
--
-- security_invoker: die View sieht genau die Strecken, die der Aufrufer über
-- die RLS von routes sehen darf (freigegeben/öffentlich, eigene private,
-- Moderatoren den Rest). Ohne das liefe sie mit den Rechten des Besitzers und
-- verriete die Existenz privater Strecken an einem Pass.
create view public.strecken_paesse
  with (security_invoker = true) as
select r.id as route_id, p.id as pass_id
from public.routes r
join public.paesse p on st_dwithin(r.geometry, p.scheitel, 400);

grant select on public.strecken_paesse to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Passstatus
-- ---------------------------------------------------------------------------

create table public.pass_status (
  pass_id text primary key references public.paesse (id) on delete cascade,
  zustand text not null check (
    zustand in ('offen', 'eingeschraenkt', 'gesperrt', 'wintersperre', 'unbekannt')
  ),
  meldung text check (char_length(meldung) <= 500),
  quelle text not null check (quelle in ('feed', 'moderation')),
  -- Seit wann dieser Zustand gilt (nicht: wann die Zeile zuletzt
  -- geschrieben wurde — das ist aktualisiert_am).
  seit timestamptz not null default now(),
  -- Eine Moderator-Übersteuerung gilt bis hierhin; bis dahin schreibt der
  -- Feed nicht über sie hinweg (pass_status_anwenden).
  manuell_bis timestamptz,
  aktualisiert_am timestamptz not null default now(),
  constraint manuell_nur_moderation check (manuell_bis is null or quelle = 'moderation')
);

alter table public.pass_status enable row level security;

create policy "Passstatus ist öffentlich"
  on public.pass_status for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.pass_status from anon, authenticated;

-- Jeder Zustandswechsel, append-only. Speist drei Dinge: die Meldung an
-- Folgende ("Sustenpass ist offen"), den Kalender ("geöffnet am 5. Juni")
-- und, über die Jahre, die tatsächlichen Öffnungsdaten eines Passes.
create table public.pass_ereignisse (
  id bigint generated always as identity primary key,
  pass_id text not null references public.paesse (id) on delete cascade,
  zustand text not null check (zustand in ('offen', 'eingeschraenkt', 'gesperrt', 'wintersperre')),
  -- Der letzte bekannte Zustand davor; null nur beim allerersten Eintrag
  -- eines Passes. "unbekannt" kommt hier nie vor: ein Feed-Ausfall ist kein
  -- Ereignis am Pass.
  vorher text check (vorher in ('offen', 'eingeschraenkt', 'gesperrt', 'wintersperre')),
  quelle text not null check (quelle in ('feed', 'moderation')),
  meldung text check (char_length(meldung) <= 500),
  erfasst_am timestamptz not null default now()
);

create index pass_ereignisse_pass_idx on public.pass_ereignisse (pass_id, erfasst_am desc);

alter table public.pass_ereignisse enable row level security;

create policy "Passereignisse sind öffentlich"
  on public.pass_ereignisse for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.pass_ereignisse from anon, authenticated;

-- Die eine Stelle, die Status schreibt — für den Feed wie für Moderatoren.
-- Zwei Schreibwege mit je eigener Übergangslogik wären zwei Meinungen darüber,
-- was ein Ereignis ist.
--
-- Nur service_role darf sie direkt rufen (der Cron-Abgleich); Moderatoren
-- kommen über pass_status_setzen(), das die Rolle prüft.
create function public.pass_status_anwenden(
  p_pass_id text,
  p_zustand text,
  p_meldung text,
  p_quelle text,
  p_manuell_bis timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_manuell_bis timestamptz;
  v_letzter text;
begin
  if p_quelle not in ('feed', 'moderation') then
    raise exception 'pass_status_anwenden: unbekannte Quelle %', p_quelle;
  end if;

  -- Ein Pass, ein Schreiber zur Zeit. Ohne Sperre könnten Feed und Moderation
  -- gleichzeitig denselben "letzten Zustand" lesen und zwei Ereignisse für
  -- einen Wechsel schreiben.
  perform pg_advisory_xact_lock(hashtext('pass_status:' || p_pass_id));

  select manuell_bis into v_manuell_bis
  from public.pass_status
  where pass_id = p_pass_id;

  if p_quelle = 'feed' and v_manuell_bis is not null and v_manuell_bis > now() then
    return false;
  end if;

  insert into public.pass_status (pass_id, zustand, meldung, quelle, seit, manuell_bis, aktualisiert_am)
  values (
    p_pass_id,
    p_zustand,
    left(nullif(btrim(p_meldung), ''), 500),
    p_quelle,
    now(),
    case when p_quelle = 'moderation' then p_manuell_bis end,
    now()
  )
  on conflict (pass_id) do update set
    zustand = excluded.zustand,
    meldung = excluded.meldung,
    quelle = excluded.quelle,
    seit = case when public.pass_status.zustand = excluded.zustand
                then public.pass_status.seit else now() end,
    manuell_bis = excluded.manuell_bis,
    aktualisiert_am = now();

  if p_zustand = 'unbekannt' then
    return false;
  end if;

  select zustand into v_letzter
  from public.pass_ereignisse
  where pass_id = p_pass_id
  order by erfasst_am desc, id desc
  limit 1;

  if v_letzter is distinct from p_zustand then
    insert into public.pass_ereignisse (pass_id, zustand, vorher, quelle, meldung)
    values (p_pass_id, p_zustand, v_letzter, p_quelle, left(nullif(btrim(p_meldung), ''), 500));
    return true;
  end if;

  return false;
end;
$$;

revoke execute on function public.pass_status_anwenden(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.pass_status_anwenden(text, text, text, text, timestamptz) to service_role;

-- Moderator-Übersteuerung. Die Gültigkeit ist Pflicht und begrenzt: eine
-- vergessene Übersteuerung soll den Feed nicht für immer stumm schalten.
-- 250 Tage reichen für "Wintersperre bis zur Öffnung im Juni".
create function public.pass_status_setzen(
  p_pass_id text,
  p_zustand text,
  p_meldung text,
  p_gueltig_bis timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_moderator = true
  ) then
    raise exception 'not authorized';
  end if;

  if p_zustand not in ('offen', 'eingeschraenkt', 'gesperrt', 'wintersperre') then
    raise exception 'ungueltiger_zustand';
  end if;

  if p_gueltig_bis is null
     or p_gueltig_bis <= now()
     or p_gueltig_bis > now() + interval '250 days' then
    raise exception 'ungueltige_gueltigkeit';
  end if;

  if char_length(coalesce(p_meldung, '')) > 500 then
    raise exception 'meldung_zu_lang';
  end if;

  if not exists (select 1 from public.paesse where id = p_pass_id) then
    raise exception 'unbekannter_pass';
  end if;

  perform public.pass_status_anwenden(p_pass_id, p_zustand, p_meldung, 'moderation', p_gueltig_bis);
end;
$$;

revoke execute on function public.pass_status_setzen(text, text, text, timestamptz) from public, anon;
grant execute on function public.pass_status_setzen(text, text, text, timestamptz) to authenticated;

-- Übersteuerung vorzeitig beenden: der nächste Feed-Abgleich schreibt wieder.
-- Der angezeigte Zustand bleibt bis dahin stehen, statt auf "unbekannt" zu
-- springen — er war ja eben noch richtig.
create function public.pass_status_freigeben(p_pass_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_moderator = true
  ) then
    raise exception 'not authorized';
  end if;

  update public.pass_status
  set manuell_bis = null,
      aktualisiert_am = now()
  where pass_id = p_pass_id;
end;
$$;

revoke execute on function public.pass_status_freigeben(text) from public, anon;
grant execute on function public.pass_status_freigeben(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Feed-Zustand
-- ---------------------------------------------------------------------------

-- Nur die Meldungen, die einem Pass zugeordnet wurden. Der Feed liefert nach
-- dem ersten Vollabruf Deltas; um zu wissen, ob am Susten noch etwas gilt,
-- muss die Menge der aktiven Meldungen zwischen zwei Abrufen erhalten bleiben.
-- Alle übrigen Verkehrsmeldungen der Schweiz haben hier nichts verloren.
-- Schlüssel aus beidem: eine Meldung kann mehrere Pässe nennen ("Furka- und
-- Grimselpass gesperrt") und liegt dann zweimal hier, einmal je Pass.
create table public.verkehrsmeldungen (
  situation_id text not null check (char_length(situation_id) between 1 and 200),
  pass_id text not null references public.paesse (id) on delete cascade,
  zustand text not null check (zustand in ('eingeschraenkt', 'gesperrt', 'wintersperre')),
  text text not null check (char_length(text) <= 2000),
  gueltig_von timestamptz,
  gueltig_bis timestamptz,
  version_am timestamptz not null,
  erfasst_am timestamptz not null default now(),
  primary key (situation_id, pass_id)
);

create index verkehrsmeldungen_pass_idx on public.verkehrsmeldungen (pass_id);

alter table public.verkehrsmeldungen enable row level security;
-- Keine Policy: nur service_role (Cron) liest und schreibt. Der Rohtext ist
-- Zwischenstand, keine Anzeige — angezeigt wird pass_status.meldung.
revoke all on public.verkehrsmeldungen from anon, authenticated;

create table public.feed_abgleich (
  quelle text primary key check (quelle in ('astra_verkehrsmeldungen')),
  -- Letzter Abruf ohne If-Modified-Since. Der Feed verlangt einen solchen
  -- höchstens täglich; dazwischen Deltas, deren Zeitstempel nicht älter als
  -- fünf Minuten sein soll.
  voll_am timestamptz,
  -- Letzter erfolgreicher Abruf, gleich welcher Art. Die App zeigt daran, wie
  -- alt ein "offen" ist, und traut einem Feed-Status nach 30 Minuten ohne
  -- Erfolg nicht mehr.
  erfolg_am timestamptz,
  fehler_am timestamptz,
  fehler text check (char_length(fehler) <= 500)
);

alter table public.feed_abgleich enable row level security;

create policy "Feed-Stand ist öffentlich"
  on public.feed_abgleich for select
  to anon, authenticated
  using (true);

-- Lesbar ist nur, wie frisch der Stand ist. Fehlertexte bleiben intern.
revoke all on public.feed_abgleich from anon, authenticated;
grant select (quelle, erfolg_am) on public.feed_abgleich to anon, authenticated;

insert into public.feed_abgleich (quelle) values ('astra_verkehrsmeldungen');

-- ---------------------------------------------------------------------------
-- Kalender: geplante Sperrungen
-- ---------------------------------------------------------------------------

create table public.pass_sperrtage (
  id uuid primary key default gen_random_uuid(),
  pass_id text not null references public.paesse (id) on delete cascade,
  von date not null,
  bis date not null,
  art text not null check (art in ('autofrei', 'veranstaltung', 'bauarbeiten', 'sonstiges')),
  titel text not null check (char_length(btrim(titel)) between 3 and 120),
  -- Freitext statt Uhrzeiten: "11–16 Uhr", "ab 8 Uhr", "nachts".
  zeitfenster text check (char_length(zeitfenster) <= 60),
  -- Die Obergrenze steht als eigene Bedingung, nicht als Wiederholung im
  -- Ausdruck: PostgreSQL lässt in einem regulären Ausdruck höchstens 255
  -- Wiederholungen zu, "{4,500}" scheitert schon beim Anlegen der Tabelle.
  quelle_url text check (
    quelle_url ~ '^https://[^[:space:]]{4,}$' and char_length(quelle_url) <= 500
  ),
  erstellt_von uuid references auth.users (id) on delete set null default auth.uid(),
  erstellt_am timestamptz not null default now(),
  constraint sperrtage_zeitraum check (bis >= von and bis - von <= 366)
);

create index pass_sperrtage_pass_idx on public.pass_sperrtage (pass_id, von);

alter table public.pass_sperrtage enable row level security;

create policy "Sperrtage sind öffentlich"
  on public.pass_sperrtage for select
  to anon, authenticated
  using (true);

-- WITH CHECK trägt die Rolle UND den Ersteller, nach der Lehre aus 0071:
-- ohne das zweite könnte ein Moderator einen Eintrag einem anderen zuschreiben.
create policy "Moderatoren legen Sperrtage an"
  on public.pass_sperrtage for insert
  to authenticated
  with check (
    erstellt_von = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and is_moderator = true)
  );

create policy "Moderatoren löschen Sperrtage"
  on public.pass_sperrtage for delete
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_moderator = true));

-- Kein UPDATE: korrigiert wird durch Löschen und neu Anlegen. Eine
-- Update-Policy bräuchte Spalten-Grants, damit erstellt_von nicht wandert.
revoke update, truncate on public.pass_sperrtage from anon, authenticated;
revoke insert, delete on public.pass_sperrtage from anon;

-- Die 2026 bereits vergangenen autofreien Tage an Pässen des Katalogs, nach
-- der TCS-Übersicht "Autofreie Alpenpässe 2026". Stehen als Vorjahreswerte im
-- Kalender; sie sind Geschichte, keine Vorhersage.
insert into public.pass_sperrtage (pass_id, von, bis, art, titel, zeitfenster, quelle_url, erstellt_von)
values
  ('lukmanier', '2026-06-07', '2026-06-07', 'autofrei', 'FreiPass Lukmanier', '11–16 Uhr', 'https://www.tcs.ch/de/tools/verkehrsinfo-verkehrslage/autofreie-paesse-2026.php', null),
  ('spluegen', '2026-06-28', '2026-06-28', 'autofrei', 'FreiPass Splügenpass', '9–15 Uhr', 'https://www.tcs.ch/de/tools/verkehrsinfo-verkehrslage/autofreie-paesse-2026.php', null),
  ('gotthard', '2026-08-23', '2026-08-23', 'veranstaltung', 'Granfondo San Gottardo (Tremola)', 'ab 8 Uhr', 'https://www.tcs.ch/de/tools/verkehrsinfo-verkehrslage/autofreie-paesse-2026.php', null),
  ('albula', '2026-09-06', '2026-09-06', 'autofrei', 'slowUp Mountain Albula', '10–16 Uhr', 'https://www.tcs.ch/de/tools/verkehrsinfo-verkehrslage/autofreie-paesse-2026.php', null);

-- ---------------------------------------------------------------------------
-- Pässen folgen
-- ---------------------------------------------------------------------------

create table public.pass_folgen (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pass_id text not null references public.paesse (id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  primary key (user_id, pass_id)
);

-- Die Meldungsabfrage geht vom Pass aus ("wer folgt dem Susten?") nicht vom
-- Nutzer; der Primärschlüssel deckt nur die andere Richtung.
create index pass_folgen_pass_idx on public.pass_folgen (pass_id);

alter table public.pass_folgen enable row level security;

create policy "Eigene Pass-Abos lesen"
  on public.pass_folgen for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Pass folgen"
  on public.pass_folgen for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Pass entfolgen"
  on public.pass_folgen for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.pass_folgen from anon;
revoke update, truncate on public.pass_folgen from authenticated;

-- ---------------------------------------------------------------------------
-- Meldungen an Folgende (Aktivität)
-- ---------------------------------------------------------------------------

-- Gleiche Konstruktion wie follows_gesehen_am (0100) und kudos_gesehen_am
-- (0053), aus demselben Grund ohne Spalten-Grant: die SELECT-Policy auf
-- profiles ist zeilenoffen.
alter table public.profiles
  add column paesse_gesehen_am timestamptz not null default now();

-- Welche Wechsel eine Meldung wert sind. Eine Hilfsfunktion statt zweimal
-- derselben Bedingung in recent_pass_meldungen und count_unseen_activity —
-- zählt das Abzeichen etwas anderes als die Liste zeigt, sucht der Nutzer
-- einen Eintrag, den es nicht gibt.
--
-- Gemeldet wird, was die Fahrt entscheidet: auf und zu. "eingeschraenkt"
-- (Schneeketten, Nachtsperre, einspurig) wechselt über einen Wintertag
-- mehrmals und wäre Lärm.
create function public.pass_ereignis_meldenswert(p_zustand text, p_vorher text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    (p_zustand = 'offen' and p_vorher in ('gesperrt', 'wintersperre'))
    or (p_zustand in ('gesperrt', 'wintersperre') and p_vorher in ('offen', 'eingeschraenkt'));
$$;

create function public.recent_pass_meldungen()
returns table (
  ereignis_id bigint,
  pass_id text,
  pass_name text,
  zustand text,
  vorher text,
  erfasst_am timestamptz,
  neu boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    e.id as ereignis_id,
    e.pass_id,
    p.name as pass_name,
    e.zustand,
    e.vorher,
    e.erfasst_am,
    e.erfasst_am > (
      select pr.paesse_gesehen_am from public.profiles pr where pr.id = auth.uid()
    ) as neu
  from public.pass_folgen f
  join public.pass_ereignisse e
    on e.pass_id = f.pass_id
   and e.erfasst_am > f.erstellt_am
  join public.paesse p on p.id = e.pass_id
  where f.user_id = auth.uid()
    and public.pass_ereignis_meldenswert(e.zustand, e.vorher)
  order by e.erfasst_am desc, e.id desc
  limit 30;
$$;

revoke execute on function public.recent_pass_meldungen() from public, anon;
grant execute on function public.recent_pass_meldungen() to authenticated;

-- count_unseen_activity und mark_activity_seen: der Rumpf ist der live
-- gelesene (identisch mit 0100), ergänzt um den dritten Summanden bzw. die
-- dritte Spalte. create or replace behält die Grants aus 0100.
create or replace function public.count_unseen_activity()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select
    (
      select count(*)
      from public.kudos k
      join public.route_completions rc on rc.id = k.completion_id
      where rc.user_id = auth.uid()
        and k.erstellt_am > (
          select p.kudos_gesehen_am from public.profiles p where p.id = auth.uid()
        )
    )
    +
    (
      select count(*)
      from public.follows f
      where f.followed_id = auth.uid()
        and f.erstellt_am > (
          select p.follows_gesehen_am from public.profiles p where p.id = auth.uid()
        )
    )
    +
    (
      select count(*)
      from public.pass_folgen pf
      join public.pass_ereignisse e
        on e.pass_id = pf.pass_id
       and e.erfasst_am > pf.erstellt_am
      where pf.user_id = auth.uid()
        and public.pass_ereignis_meldenswert(e.zustand, e.vorher)
        and e.erfasst_am > (
          select p.paesse_gesehen_am from public.profiles p where p.id = auth.uid()
        )
    );
$$;

create or replace function public.mark_activity_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set kudos_gesehen_am = now(),
      follows_gesehen_am = now(),
      paesse_gesehen_am = now()
  where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Pass-Sammlung
-- ---------------------------------------------------------------------------

-- Welche Pässe das eingeloggte Konto befahren hat, aus den eigenen
-- Aufzeichnungen: eine Fahrt zählt für einen Pass, wenn ihr Track am
-- Scheitelpunkt vorbeigeht. Das schliesst freie Fahrten ein — wer über den
-- Klausen fährt, hat ihn befahren, ob mit oder ohne Strecke.
--
-- 150 m statt der 400 m der Streckenzuordnung: ein Track ist gefahrene
-- Fahrbahn, keine aus Wegpunkten geroutete Linie, und er soll eine
-- Talstrasse unter einem Scheitel nicht als Passfahrt zählen.
--
-- security invoker: route_completions ist über RLS lesbar (eigene Zeilen),
-- die Funktion filtert zusätzlich hart auf auth.uid(). Sie braucht kein
-- Recht, das der Aufrufer nicht schon hat.
create function public.meine_paesse()
returns table (pass_id text, erstmals date, fahrten integer)
language sql
security invoker
set search_path = public, pg_temp
stable
as $$
  select
    p.id as pass_id,
    min(rc.datum) as erstmals,
    count(*)::integer as fahrten
  from public.route_completions rc
  join public.paesse p on st_dwithin(rc.track, p.scheitel, 150)
  where rc.user_id = auth.uid()
    and rc.track is not null
  group by p.id;
$$;

revoke execute on function public.meine_paesse() from public, anon;
grant execute on function public.meine_paesse() to authenticated;

-- ---------------------------------------------------------------------------
-- Kontolöschung
-- ---------------------------------------------------------------------------

-- Rumpf live gelesen (Stand 0101), ergänzt um pass_folgen. Die Kaskade von
-- auth.users greift nie, weil deleteAccount() die Zeile anonymisiert statt
-- sie zu löschen — derselbe Grund wie bei fahrt_starts in 0101.
create or replace function public.anonymize_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'anonymize_account: p_user_id darf nicht NULL sein';
  end if;

  update public.profiles
  set
    display_name = null,
    avatar_url = null,
    stripe_customer_id = null,
    zeigt_fahrzeuge = false,
    zeigt_avatar = false,
    zeigt_paesse = false,
    zeigt_hoehenmeter = false,
    zeigt_distanz = false,
    zeigt_follower_liste = false,
    zeigt_premium_badge = false,
    is_moderator = false,
    ist_premium = false,
    geloescht_am = coalesce(geloescht_am, now())
  where id = p_user_id;

  update public.route_completions
  set
    track = null,
    track_oeffentlich = null,
    ist_oeffentlich = case when art = 'frei' then false else ist_oeffentlich end
  where user_id = p_user_id;

  delete from public.vehicles where user_id = p_user_id;

  delete from public.subscriptions where user_id = p_user_id;

  -- Seit 0090.
  delete from public.registrierung_herkunft where user_id = p_user_id;

  update public.creator_konversionen
  set user_id = null
  where user_id = p_user_id;

  -- Seit 0092: die Codes selbst bleiben stehen und laufen weiter, nur
  -- ohne Besitzer. Damit verliert das geloeschte Konto zugleich den Zugang
  -- zu /creator — die Seite kennt keine andere Berechtigung als diese Spalte.
  update public.creator_links
  set creator_user_id = null
  where creator_user_id = p_user_id;

  -- Neu in 0101: der serverseitige Fahrtstart samt letzter Position.
  -- Die Kaskade aus 0096 feuert nie, weil deleteAccount() die Zeile in
  -- auth.users nicht loescht, sondern anonymisiert. Beide Spalten, weil ein
  -- Gast zwischen Start und Speichern anmeldet und dann nur in
  -- eingeloest_von steht.
  delete from public.fahrt_starts
   where user_id = p_user_id
      or eingeloest_von = p_user_id;

  -- Neu in 0104: welchen Pässen das Konto folgte.
  delete from public.pass_folgen where user_id = p_user_id;
end;
$$;
