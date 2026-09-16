-- Ein neuer Follower ist eine Reaktion wie ein Kudo — und bisher die
-- einzige, von der der Betroffene nichts erfährt. Wer jemandem folgt,
-- landete nur in einer Liste auf dessen Profil (0037/0039/0040), die
-- niemand ohne Anlass öffnet. Damit fehlt genau der Rückkanal, den
-- 0053_kudos_gesehen.sql für Kudos gebaut hat (AGENTS.md, "Core User
-- Loop", Schritt 7→8).
--
-- Bewusst derselbe minimale Ansatz wie dort, kein Notifications-System:
-- keine eigene Ereignistabelle, kein Trigger, kein Push. Die
-- Benachrichtigung wird aus der bestehenden follows-Zeile abgeleitet, ein
-- "zuletzt gesehen"-Zeitpunkt pro Nutzer trennt neu von alt.
--
-- Zwei Folgen dieser Ableitung, beide akzeptiert statt kaschiert:
--   * Entfolgt jemand wieder, verschwindet auch die Meldung rückwirkend --
--     die Zeile ist weg (0030: delete-Policy für den Follower).
--   * Folgen → entfolgen → folgen erzeugt eine zweite Meldung mit neuem
--     Zeitstempel. Der Cooldown in lib/actions/follows.ts (500 ms) bremst
--     das, verhindert es nicht. Ein append-only Ereignislog wäre der Preis
--     dafür; für die erste Fassung ist er zu hoch.

-- ---------------------------------------------------------------------------
-- A) Der "zuletzt gesehen"-Zeitpunkt, exakt nach dem Muster von
--    kudos_gesehen_am (0053_kudos_gesehen.sql).
-- ---------------------------------------------------------------------------
-- default now() aus demselben Grund wie dort: Bestandsnutzer sollen beim
-- Anwenden nicht ihre gesamte Follower-Historie als "neu" vorgesetzt
-- bekommen. Der Zähler startet bei null und wächst erst ab jetzt.
alter table public.profiles
  add column follows_gesehen_am timestamptz not null default now();

comment on column public.profiles.follows_gesehen_am is
  'Zeitpunkt, zu dem der Nutzer zuletzt seine neuen Follower gesehen hat. Bewusst KEIN Spalten-Grant an anon/authenticated -- die SELECT-Policy auf profiles ist zeilenoffen ("using (true)"), ein Grant verriete also jedem eingeloggten Nutzer, wann ein beliebiger anderer zuletzt seine Aktivitaet angesehen hat. Nur ueber recent_follows_received()/count_unseen_activity()/mark_activity_seen() gelesen bzw. geschrieben, alle drei auf auth.uid() beschraenkt. Gleiche Begruendung wie kudos_gesehen_am (0053_kudos_gesehen.sql).';

-- ---------------------------------------------------------------------------
-- B) Die Liste: die letzten Follower, mit "neu"-Flag.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER wie recent_kudos_received (0057) -- aber nur für EINEN
-- der beiden dortigen Gründe: die follows-Zeilen selbst dürfte der Aufrufer
-- ohnehin sehen (0030, Policy "Nutzer sehen eigene Folge-Beziehungen"
-- erlaubt auth.uid() = followed_id), und display_name/avatar_url auf
-- profiles tragen Spalten-Grants. Erhoben wird ausschliesslich für
-- follows_gesehen_am oben, das keinen Grant hat und auch keinen bekommen
-- soll.
--
-- Nimmt wie ihre Kudos-Schwester keine Parameter: sie arbeitet
-- ausschliesslich auf auth.uid() und kann nicht für ein fremdes Konto
-- aufgerufen werden. Festes Limit statt eines vom Aufrufer wählbaren --
-- eine "letzte Reaktionen"-Liste braucht keine Pagination.
--
-- avatar_url respektiert zeigt_avatar (0015) wie überall sonst, und zwar
-- hier serverseitig statt beim Aufrufer -- dieselbe Regel, die
-- public_follows (0037) für die Profil-Listen anwendet. Der Anzeigename
-- bleibt ungefiltert: er ist über public_fahrten, die Bestenlisten und die
-- Follower-Listen ohnehin öffentlich, und ohne ihn wäre die Meldung
-- sinnlos.
--
-- Kein neuer Index: follows_followed_id_idx (0030) deckt den Filter ab, und
-- pro Konto stehen dahinter zu wenige Zeilen, als dass die Sortierung ins
-- Gewicht fiele.
create function public.recent_follows_received()
returns table (
  follower_id uuid,
  follower_display_name text,
  follower_avatar_url text,
  erstellt_am timestamptz,
  neu boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    f.follower_id,
    p.display_name as follower_display_name,
    case when p.zeigt_avatar then p.avatar_url else null end as follower_avatar_url,
    f.erstellt_am,
    f.erstellt_am > (
      select pr.follows_gesehen_am from public.profiles pr where pr.id = auth.uid()
    ) as neu
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followed_id = auth.uid()
  order by f.erstellt_am desc
  limit 30;
$$;

comment on function public.recent_follows_received() is
  'Die letzten (max. 30) Follower des eingeloggten Nutzers, inkl. eines "neu"-Flags relativ zu profiles.follows_gesehen_am. Nur fuer auth.uid() selbst; avatar_url respektiert zeigt_avatar (0015). Gegenstueck zu recent_kudos_received (0057_kudos_aktivitaetsliste.sql).';

revoke execute on function public.recent_follows_received() from public;
revoke execute on function public.recent_follows_received() from anon;
grant execute on function public.recent_follows_received() to authenticated;

-- ---------------------------------------------------------------------------
-- C) Der Zähler für die Kopfleiste -- beide Arten in EINER Zahl.
-- ---------------------------------------------------------------------------
-- Warum eine neue Funktion und nicht zwei Aufrufe: <Header /> läuft auf
-- jeder Seite und fragt den Zähler dort ab (components/Header.tsx). Zwei
-- RPCs statt einem wären ein zusätzlicher Roundtrip pro Seitenaufruf für
-- eine einzige Zahl.
--
-- count_unseen_kudos (0053) bleibt unangetastet: /profil zeigt die eigenen
-- Fahrten und markiert dort nur die Kudos als gesehen -- es braucht
-- weiterhin genau diese Teilzahl.
--
-- Bei auth.uid() = NULL liefern beide Unterabfragen 0 (der Vergleich gegen
-- NULL ist nie wahr), die Funktion also 0 statt einer Fremdzahl.
create function public.count_unseen_activity()
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
    );
$$;

comment on function public.count_unseen_activity() is
  'Ungesehene Reaktionen des eingeloggten Nutzers insgesamt: Kudos auf eigenen Fahrten (seit kudos_gesehen_am) plus neue Follower (seit follows_gesehen_am). Nur fuer auth.uid() selbst. Speist das Abzeichen in der Kopfleiste; count_unseen_kudos (0053) bleibt fuer /profil bestehen.';

revoke execute on function public.count_unseen_activity() from public;
revoke execute on function public.count_unseen_activity() from anon;
grant execute on function public.count_unseen_activity() to authenticated;

-- ---------------------------------------------------------------------------
-- D) Als gesehen markieren -- beide Zeitpunkte zusammen.
-- ---------------------------------------------------------------------------
-- Aufgerufen beim Laden von /aktivitaet, wo beide Arten nebeneinander
-- stehen (app/aktivitaet/page.tsx). Gleiches Muster wie mark_kudos_seen
-- (0053): schreibt ausschliesslich einen fest codierten, harmlosen Wert
-- (den aktuellen Zeitstempel) in die eigene, über auth.uid() gebundene
-- Zeile -- keine Werteingabe von aussen, nicht für ein fremdes Konto
-- aufrufbar.
create function public.mark_activity_seen()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set kudos_gesehen_am = now(),
      follows_gesehen_am = now()
  where id = auth.uid();
end;
$$;

comment on function public.mark_activity_seen() is
  'Markiert Kudos UND neue Follower als gesehen (setzt profiles.kudos_gesehen_am und follows_gesehen_am auf now()). Nur fuer auth.uid() selbst. Aufgerufen von /aktivitaet, wo beides nebeneinander steht; mark_kudos_seen (0053) bleibt fuer /profil bestehen, wo nur die Kudos zu sehen sind.';

revoke execute on function public.mark_activity_seen() from public;
revoke execute on function public.mark_activity_seen() from anon;
grant execute on function public.mark_activity_seen() to authenticated;
