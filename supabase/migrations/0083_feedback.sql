-- Rückmeldungen aus der App: "Feedback senden" in den Einstellungen
-- (app/profil/einstellungen). Bis hierhin gab es dafür keinen Weg ausser
-- der im Impressum genannten E-Mail-Adresse — die aber niemand sieht, der
-- in der App sitzt, und die kein Konto, keine Kategorie und keinen
-- Bearbeitungsstand mitbringt.
--
-- Aufbau bewusst nah an route_reports/rating_reports/completion_reports
-- (0043, 0046): feste Kategorien statt Freitext, damit die Liste in
-- /moderation filter- und auswertbar bleibt, plus status/bearbeitet_am/
-- bearbeitet_von als Warteschlangen-Zustand.
--
-- Anders als bei den Meldungen gibt es hier KEINE unique-Beschränkung pro
-- Nutzer: Feedback ist wiederholbar, jemand meldet heute einen Fehler und
-- morgen eine Idee. Gegen Massen-Einsendungen steht stattdessen der
-- Cooldown-Trigger unten.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kategorie text not null check (kategorie in ('fehler', 'idee', 'lob', 'sonstiges')),
  -- Untergrenze, damit ein versehentlich abgeschicktes "hi" nicht als
  -- Rückmeldung in der Warteschlange landet; Obergrenze als Schreibrand
  -- gegen beliebig grosse Texte. Dieselben Grenzen prüft
  -- lib/feedback.ts app-seitig, damit der Nutzer einen Hinweis statt eines
  -- Datenbankfehlers sieht — durchgesetzt wird hier.
  nachricht text not null check (char_length(nachricht) between 10 and 2000),
  status text not null default 'offen' check (status in ('offen', 'erledigt')),
  erstellt_am timestamptz not null default now(),
  bearbeitet_am timestamptz,
  bearbeitet_von uuid references auth.users (id) on delete set null
);

-- Die Moderationsseite liest ausschliesslich "offen", älteste zuerst.
create index feedback_status_erstellt_am_idx on public.feedback (status, erstellt_am);

alter table public.feedback enable row level security;

create policy "Angemeldete Nutzer können Feedback senden"
  on public.feedback for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Moderatoren sehen Feedback"
  on public.feedback for select
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_moderator = true));

-- Das WITH CHECK ist hier kein Beiwerk, sondern die Lehre aus 0071 (Befund
-- N7): fehlt es, verwendet Postgres die USING-Bedingung auch als Check — und
-- die prüft nur den Aufrufer, keine Spalte der Zeile, ist als Check also
-- unbedingt wahr. Ein Moderator könnte das Abhaken damit einem anderen
-- Moderator zuschreiben. Wer abhakt, trägt sich selbst ein.
--
-- Weiter reicht eine Policy nicht: ob eine Spalte gegenüber dem Vorzustand
-- verändert wurde, sieht sie nicht (nur die neue Zeile). Dass nachricht,
-- kategorie und user_id unverändert bleiben, sichert deshalb der
-- Spalten-Grant unten, nicht dieses Prädikat.
create policy "Moderatoren bearbeiten Feedback"
  on public.feedback for update
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_moderator = true))
  with check (bearbeitet_von = (select auth.uid()));

-- Spalten-Grants nach dem Muster aus 0034_profiles_column_grant_hardening.sql
-- und 0046_fahrt_meldungen.sql. Die RLS-Policy oben bindet die ZEILE an den
-- Absender, sagt aber nichts darüber, welche SPALTEN er dabei füllt: ohne
-- diese Einschränkung könnte ein direkter PostgREST-Schreibzugriff sein
-- eigenes Feedback gleich mit status='erledigt' und einem erfundenen
-- bearbeitet_von einliefern — es stünde damit nie in der Warteschlange,
-- die genau auf status='offen' filtert.
--
-- Supabase erteilt neuen Tabellen in public per Default-Privileges alle
-- Rechte an anon und authenticated; deshalb erst vollständig entziehen und
-- dann gezielt wieder erteilen. anon bekommt nichts zurück: Feedback setzt
-- ein Konto voraus (auch die Insert-Policy gilt nur für authenticated).
revoke all on public.feedback from anon, authenticated;
grant insert (user_id, kategorie, nachricht) on public.feedback to authenticated;
-- select/update sind für Moderatoren, die RLS-Policies oben grenzen sie auf
-- diese ein. update nur auf den Warteschlangen-Zustand: der eingesandte Text
-- selbst ist nachträglich für niemanden änderbar.
grant select on public.feedback to authenticated;
grant update (status, bearbeitet_am, bearbeitet_von) on public.feedback to authenticated;

comment on table public.feedback is
  'Rückmeldungen aus der App (Einstellungen → Feedback senden). Einsenden nur für Angemeldete, Lesen und Bearbeiten nur für Moderatoren — siehe Policies und Spalten-Grants dieser Migration.';

-- Cooldown wie bei Fahrten/Bewertungen/Streckenvorschlägen
-- (0024_atomic_rate_limit_cooldown.sql, 0041_route_proposal_cooldown.sql):
-- pg_advisory_xact_lock serialisiert parallele Versuche desselben Nutzers,
-- sodass der exists-Check danach konsistent ist (TOCTOU).
--
-- Anders als dort steht app-seitig KEIN isRateLimited daneben: der müsste
-- die letzte eigene Zeile lesen, und die Select-Policy oben gibt sie ihm
-- nicht. Dieser Trigger ist hier also nicht die zweite Schranke, sondern die
-- einzige — siehe lib/actions/feedback.ts.
--
-- Lock-Klasse 4: 1 = Fahrten (0024/0050), 2 = Bewertungen (0024/0041),
-- 3 = Streckenvorschläge (0041). Eine eigene Klasse, damit sich Feedback
-- und Fahrt desselben Nutzers nicht gegenseitig blockieren.
--
-- 60 Sekunden statt der 3–5 der Meldungen: eine Rückmeldung zu tippen
-- dauert länger als ein Doppelklick, echte Nutzung verliert dadurch nichts,
-- und die Warteschlange wird von einem Skript nicht im Sekundentakt gefüllt.
create or replace function public.enforce_feedback_cooldown()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(4, hashtext(new.user_id::text));

  if exists (
    select 1 from public.feedback
    where user_id = new.user_id
      and erstellt_am > now() - interval '60 seconds'
  ) then
    raise exception 'cooldown_active';
  end if;

  return new;
end;
$$;

-- execute entziehen wie in 0079_kontingent_trigger_execute_entziehen.sql:
-- die Funktion läuft als security definer und wird ausschliesslich vom
-- Trigger aufgerufen. Direkt aufrufbar wäre sie für jeden Angemeldeten ein
-- beliebiger pg_advisory_xact_lock mit selbst gewähltem Schlüssel.
--
-- Der Entzug gegen PUBLIC ist der wirksame, und deshalb steht er zuerst:
-- anon und authenticated haben hier nie ein eigenes EXECUTE-Recht, sie erben
-- es von PUBLIC, das PostgreSQL bei CREATE FUNCTION automatisch vergibt. Ein
-- revoke gegen sie allein ist eine stille No-Op mit WARNING — genau der
-- Fehler, den 0027 gemacht hat und den 0047 für fünf Funktionen nachträglich
-- geradeziehen musste. Die zweite Zeile steht nur der Vollständigkeit halber
-- daneben, falls später jemand ein direktes Grant erteilt.
--
-- Trigger feuern unabhängig davon weiter: beim Auslösen prüft PostgreSQL
-- kein EXECUTE-Recht auf der Trigger-Funktion (siehe 0047).
revoke execute on function public.enforce_feedback_cooldown() from public;
revoke execute on function public.enforce_feedback_cooldown() from anon, authenticated;

drop trigger if exists feedback_cooldown on public.feedback;
create trigger feedback_cooldown
  before insert on public.feedback
  for each row execute procedure public.enforce_feedback_cooldown();
