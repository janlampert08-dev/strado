-- Nacharbeit zu 0104/0105, aus der Review des eigenen Zweigs.
--
-- Zwei Befunde, beide an schon eingespielten Objekten — deshalb eine neue
-- Datei und keine Änderung der alten (AGENTS.md, Regel 9).

-- ---------------------------------------------------------------------------
-- 1. Die Schwelle in strecken_startzeiten zählte die falsche Menge
-- ---------------------------------------------------------------------------
--
-- 0105 gibt die Startzeiten erst ab 20 Starts heraus und begründet das mit
-- einem Satz, der stimmt: "bei drei Starts wäre '33 % Sonntagmorgen' ein Satz
-- über eine Person". Die Schwelle prüfte aber die GESAMTZAHL, und die Ausgabe
-- hat sieben Wochentage mal vier Tagesfächer, also 28 Fächer.
--
-- Damit blieb genau der Fall offen, den die Begründung ausschliessen wollte:
-- bei n = 20 wird ein Fach mit einem einzigen Start als "5 %" ausgeliefert.
-- Jeder Wert ist ein Vielfaches von 5, der Nenner ist also ablesbar — und
-- damit auch, dass hinter diesem Fach eine einzige Fahrt steht. fahrt_starts
-- enthält auch Starts, aus denen nie eine veröffentlichte Fahrt wurde; die
-- Funktion ist an anon vergeben. Das ist derselbe Mechanismus wie in 0094
-- (ein Tages-Eimer mit genau einer Registrierung).
--
-- Die Schwelle gehört deshalb an das Fach, nicht an die Summe. Beides bleibt
-- stehen: mindestens 20 Starts insgesamt UND mindestens 5 je gezeigtem Fach.
-- Ein Fach unter der Schwelle fällt weg, statt gerundet zu werden — die
-- Anteile summieren sich danach nicht mehr auf 100, und das ist richtig so:
-- lib/ruhigeZeiten.ts liest nur den grössten Wert.
create or replace function public.strecken_startzeiten(p_route_id uuid)
returns table (wochentag smallint, tageszeit text, anteil smallint)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with starts as (
    select
      extract(isodow from s.gestartet_am at time zone 'Europe/Zurich')::smallint as wochentag,
      extract(hour from s.gestartet_am at time zone 'Europe/Zurich')::integer as stunde
    from public.fahrt_starts s
    join public.routes r on r.id = s.strecke_id
    where s.strecke_id = p_route_id
      and s.art = 'strecke'
      and r.status_ok = true
      and r.ist_privat = false
      and s.gestartet_am > now() - interval '365 days'
  ),
  gesamt as (
    select count(*) as n from starts
  )
  select
    starts.wochentag,
    case
      when starts.stunde < 10 then 'morgen'
      when starts.stunde < 14 then 'mittag'
      when starts.stunde < 18 then 'nachmittag'
      else 'abend'
    end as tageszeit,
    round(100.0 * count(*) / gesamt.n)::smallint as anteil
  from starts, gesamt
  where gesamt.n >= 20
  group by starts.wochentag, 2, gesamt.n
  having count(*) >= 5;
$$;

-- ---------------------------------------------------------------------------
-- 2. pg_temp im search_path der beiden Aktivitätsfunktionen
-- ---------------------------------------------------------------------------
--
-- 0104 hat count_unseen_activity() und mark_activity_seen() ersetzt und dabei
-- den search_path aus 0100 mitgenommen: nur "public". Ohne ausdrücklich
-- genanntes pg_temp sucht PostgreSQL das temporäre Schema zuerst ab, und ein
-- angemeldetes Konto, das temporäre Objekte anlegen darf, bekommt damit eine
-- Fläche, um in zwei SECURITY-DEFINER-Rümpfe hineinzuschatten. Jede andere
-- Funktion aus 0104 schreibt "public, pg_temp" — diese beiden nicht, weil sie
-- geerbt wurden.
--
-- Die Rümpfe sind unverändert gegenüber 0104 (dort gegen die live gelesene
-- Fassung gestellt); geändert wird ausschliesslich der search_path.
create or replace function public.count_unseen_activity()
returns bigint
language sql
security definer
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
