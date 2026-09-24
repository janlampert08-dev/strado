-- 0121: Signup-Link mit 7 Tagen Gratis-Premium.
--
-- WARUM ES DAS GIBT
--
-- Ein fester Einladungs-Link (app.strado.ch/registrieren?promo=7-tage-gratis),
-- ueber den sich neue Konten registrieren und dafuer 7 Tage Premium erhalten —
-- ohne Zahlungsdaten, ohne Abo, mit automatischem Ablauf. Angezeigt und
-- kopiert wird er im Moderations-Panel (/moderation). Beschluss: ein fester
-- Link (kein Mehrcode-System), nur Neuregistrierungen, Ablauf automatisch.
--
-- WARUM EINE DRITTE QUELLE NEBEN ABO UND PASS
--
-- Die Projektion profiles.ist_premium ist seit 0110
--
--     subscription_ist_premium(Abo)  ODER  ein gueltiger Saisonpass
--
-- und jede Stelle, die sie schreibt, muss alle Quellen kennen (AGENTS.md:
-- "a fourth writer has to know both halves"). Gratis-Premium als blosses
-- manuelles ist_premium = true zu setzen reichte nicht: premium_abgleich
-- fasst Handeintraege ohne Abo- oder Pass-Zeile bewusst nicht an, der Zugang
-- liefe also nie ab. Deshalb steht hier die dritte Quelle daneben:
--
--     ...  ODER  ein gueltiges Gratis-Premium (premium_gratis_gueltig)
--
-- und alle vier Schreiber kennen sie: apply_subscription_state (Stripe-
-- Ereignisse duerfen Gratis nicht wegnehmen), premium_abgleich (Ablauf),
-- saisonpass_erstatten (Erstattung darf Gratis nicht wegnehmen) und
-- anonymize_account (Loeschung raeumt die Zeile ab).
--
-- WARUM DER TRIGGER VERGIBT UND NICHT DIE APP
--
-- Bei aktivierter E-Mail-Bestaetigung liefert signUp() keine Session: das
-- Profil entsteht erst durch handle_new_user auf auth.users. Der Promo-Wert
-- reist wie herkunft_code in raw_user_meta_data mit (client-setzbar, also
-- Vorschlag statt Tatsache) und wird hier gegen premium_promo_codes
-- geprueft — dieselbe Kette wie 0088. Ein eigener Block mit exception wie
-- in 0094: die Vergabe darf die Registrierung niemals abbrechen.
--
-- MISSBRAUCH
--
-- Der Code steht im Link und ist damit teil-oeffentlich. Begrenzt wird das
-- durch: einmal pro Konto (user_id ist Primaerschluessel), nur bei der
-- Registrierung (kein Einloesen fuer Bestandskonten), personalisierte
-- Gratis-Zeit (kein Stichtag zum Abgreifen). Dass sich jemand mit mehreren
-- Adressen mehrere Konten anlegt, verhindert das nicht — wie kein Test-
-- zeitraum ohne Zahlungsdaten. Der Schaden ist auf 7 Tage Premium ohne
-- Kostenfolge begrenzt.
--
-- OFFEN, KEIN TEIL DIESER MIGRATION
--
-- AGB Ziff. 4.5 ("Ein kostenloser Testzeitraum wird nicht angeboten") und
-- diese 7 Tage widersprechen sich dem Wortlaut nach. Ob der Link als
-- Einladungs- statt Test-Angebot danebensteht oder die AGB einen Satz
-- brauchen, ist eine Produkt-/Rechtsentscheidung — sie faellt nicht in
-- dieser Datei. Wer den Link verteilt, bevor das geklaert ist, verteilt ihn
-- gegen den eigenen Vertragstext.
--
-- WAS ERSETZT WIRD, UND GEGEN WELCHE FASSUNG
--
-- handle_new_user: zuletzt 0094. Der Koerper unten ist 0094 Anweisung fuer
--   Anweisung, mit genau einem Zusatz — dem Promo-Block. Vor dem Einspielen
--   den Live-Koerper lesen und vergleichen (AGENTS.md, "create or replace
--   auf einer Live-Funktion"):
--     select pg_get_functiondef('public.handle_new_user()'::regprocedure);
-- apply_subscription_state: zuletzt 0110 (Rumpf aus 0062). Einzige Aenderung
--   gegenueber 0110: die Projektion enthaelt zusaetzlich das Gratis-Premium.
--   Die Identitaetspruefung aus 0062 rechnet bewusst weiter nur mit dem Abo
--   (v_ist_premium) — ein laufendes Gratis darf nicht dazu fuehren, dass ein
--   fremdes, beendetes Abo ein laufendes ueberschreibt:
--     select pg_get_functiondef('public.apply_subscription_state(text, text,
--       text, text, timestamptz, boolean, timestamptz, text, text, integer)'::regprocedure);
-- premium_abgleich: zuletzt 0110 (Rumpf aus 0059). Aenderung: die Soll-Menge
--   laeuft zusaetzlich ueber premium_gratis, damit abgelaufenes Gratis
--   abgeschaltet wird.
-- saisonpass_erstatten: zuletzt 0110. Aenderung: v_soll enthaelt zusaetzlich
--   das Gratis-Premium.
-- anonymize_account: zuletzt 0120 (Rumpf aus 0115). Aenderung: loescht die
--   Gratis-Zeile. Vor dem Einspielen den Live-Koerper lesen:
--     select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'anonymize_account';
--
-- DER WEG ZURUECK
--
-- Neue Objekte droppen (premium_gratis_gueltig, premium_gratis,
-- premium_promo_codes), die vier Funktionen auf die Ruempfe aus
-- 0094/0110/0110/0120 zuruecksetzen. Die Tabellen duerfen als Beleg stehen
-- bleiben, solange ein Gratis noch laeuft — geloescht werden sollte nichts,
-- solange premium_abgleich die Zeilen noch als Soll-Grund sieht.
--
-- PRUEFUNG nach dem Einspielen (Katalog):
--   select code, tage, aktiv from public.premium_promo_codes;
--   select has_function_privilege('anon', 'public.premium_gratis_gueltig(uuid)', 'execute') as anon,
--          has_function_privilege('authenticated', 'public.premium_gratis_gueltig(uuid)', 'execute') as authenticated,
--          has_function_privilege('service_role', 'public.premium_gratis_gueltig(uuid)', 'execute') as service_role;
--   select position('premium_gratis' in pg_get_functiondef(p.oid)) > 0 as kennt_gratis
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in
--      ('handle_new_user', 'apply_subscription_state', 'premium_abgleich', 'saisonpass_erstatten', 'anonymize_account');
--
-- FUNKTIONALER TEST, zurueckgerollt (Muster aus 0098/0101): Profil eines
-- Testkontos lesen (ist_premium false), Gratis-Zeile mit gueltig_bis in der
-- Vergangenheit einlegen, premium_abgleich() laufen lassen, ist_premium als
-- false lesen — alles in einem DO-Block, dessen Ergebnis ueber
-- raise exception zurueckkommt und denselben Block zurueckrollt.

-- ---------------------------------------------------------------------------
-- Tabelle 1: die vergebenen Promo-Codes
-- ---------------------------------------------------------------------------
--
-- Ein fester Link heisst eine Zeile — die Tabelle statt einer Konstanten,
-- weil der Trigger (SQL) den Code pruefen muss und kein process.env kennt.
-- Mehr Codes spaeter sind damit angelegt, ohne dass diese Datei es verspricht:
-- handle_new_user nimmt jeden aktiven Code mit dessen Tageszahl.

create table public.premium_promo_codes (
  code text primary key,
  -- Wie viele Tage Premium die Einloesung schenkt.
  tage smallint not null,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),

  -- Dasselbe Muster wie creator_links (0084): der Code wandert unveraendert
  -- in eine URL (?promo=<code>), die Anwendung prueft zuerst, das hier ist
  -- die letzte Schranke.
  constraint premium_promo_codes_code_format
    check (code ~ '^[a-z0-9-]{2,32}$'),
  constraint premium_promo_codes_tage
    check (tage between 1 and 30)
);

comment on table public.premium_promo_codes is
  'Promo-Codes fuer Gratis-Premium bei der Registrierung (0121). Ein aktiver Code in raw_user_meta_data.promo_code loest in handle_new_user() tage Tage Premium aus. Verwaltet per SQL, angezeigt im Moderations-Panel — derselbe Code steht als PROMO_CODE in lib/promo.ts.';

alter table public.premium_promo_codes enable row level security;

-- Erst vollstaendig entziehen, dann gezielt geben (0084, 0034): Supabase
-- vergibt neuen Tabellen per Default Rechte an anon und authenticated.
revoke all on public.premium_promo_codes from anon, authenticated;

-- Nur authenticated bekommt Tabellenrechte; die Policy darunter beschraenkt
-- das auf Moderatoren. Kein Personenbezug in dieser Tabelle (Code, Tage,
-- Schalter), aber die Liste gehoert trotzdem der Moderation: wer die Codes
-- kennt, kennt die verteilten Links.
grant select on public.premium_promo_codes to authenticated;

create policy "Moderatoren lesen Promo-Codes"
  on public.premium_promo_codes for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_moderator = true
    )
  );

comment on policy "Moderatoren lesen Promo-Codes" on public.premium_promo_codes is
  'Das Moderations-Panel zeigt den Signup-Link samt Status an. Normale Konten sehen keine Zeile (0121).';

-- Der eine feste Link. Derselbe Wert steht als PROMO_CODE in lib/promo.ts —
-- driftet beides auseinander, zeigt das Panel einen toten Link. on conflict
-- do nothing statt Fehler: die Datei bleibt wiederholbar, ohne einen
-- abgeschalteten Code je wieder anzuschalten.
insert into public.premium_promo_codes (code, tage)
values ('7-tage-gratis', 7)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Tabelle 2: vergebenes Gratis-Premium je Konto
-- ---------------------------------------------------------------------------

create table public.premium_gratis (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- Fremdschluessel wie in registrierung_herkunft (0088): ein Code, an dem
  -- Einloesungen haengen, laesst sich nicht loeschen — deaktivieren statt
  -- loeschen ist der vorgesehene Weg.
  code text not null references public.premium_promo_codes (code),
  gueltig_ab timestamptz not null,
  gueltig_bis timestamptz not null,
  vergeben_am timestamptz not null default now(),

  constraint premium_gratis_zeitraum check (gueltig_bis > gueltig_ab)
);

comment on table public.premium_gratis is
  'Vergebenes Gratis-Premium je Konto, genau einmal (0121). Geschrieben ausschliesslich von handle_new_user() nach Pruefung gegen premium_promo_codes; bei der Kontoloeschung entfernt. Keine Policy und keine Grants: erreichbar nur ueber SECURITY DEFINER-Funktionen und den Service-Role-Client — dieselbe Linie wie registrierung_herkunft (0088).';

alter table public.premium_gratis enable row level security;

revoke all on public.premium_gratis from anon, authenticated;

create index premium_gratis_bis_idx
  on public.premium_gratis (gueltig_bis);

-- ---------------------------------------------------------------------------
-- Die Regel: gilt fuer diese Person gerade ein Gratis-Premium?
-- ---------------------------------------------------------------------------

create function public.premium_gratis_gueltig(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.premium_gratis g
    where g.user_id = p_user_id
      and g.gueltig_ab <= now()
      and now() < g.gueltig_bis
  );
$$;

comment on function public.premium_gratis_gueltig(uuid) is
  'Einzige Definition, wann ein vergebenes Gratis-Premium Premium gewaehrt (0121). Wie subscription_ist_premium und saisonpass_gueltig wird das Ergebnis in profiles.ist_premium gespeichert, nicht laufend ausgewertet — der Ablauf braucht premium_abgleich().';

-- ---------------------------------------------------------------------------
-- handle_new_user: Koerper aus 0094, um den Promo-Block erweitert
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_promo text;
  v_tage smallint;
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');

  v_code := new.raw_user_meta_data ->> 'herkunft_code';

  -- Unveraendert aus 0094: raw_user_meta_data ist client-setzbar, der Wert
  -- ist ein Vorschlag. Nur ein vergebener, aktiver Code zaehlt, und die
  -- Erfassung kann die Registrierung nicht abbrechen.
  if v_code is not null and exists (
    select 1 from public.creator_links where code = v_code and aktiv
  ) then
    begin
      insert into public.registrierung_herkunft (user_id, code)
      values (new.id, v_code)
      on conflict do nothing;

      insert into public.creator_konversionen
        (code, art, user_id, ereignis_am, registriert_am)
      values (v_code, 'registrierung', new.id, now(), now())
      on conflict do nothing;
    exception
      when others then
        raise warning 'Herkunft fuer % konnte nicht erfasst werden: %', new.id, sqlerrm;
    end;
  end if;

  -- Neu in 0121: Gratis-Premium ueber den Signup-Link. promo_code reist wie
  -- herkunft_code in den Metadaten mit (lib/actions/auth.ts, hidden field
  -- aus ?promo=) und ist genauso client-setzbar — geprueft wird hier gegen
  -- premium_promo_codes, vergeben wird die Tageszahl des Codes.
  --
  -- Einmal pro Konto (user_id ist Primaerschluessel, on conflict do
  -- nothing); unbekannt, inaktiv oder fehlend fuehrt zu nichts. Eigener
  -- Block mit exception aus demselben Grund wie darueber: was hier
  -- schiefgeht, ist ein verlorenes Geschenk — eine verlorene Registrierung
  -- waere teurer als jedes Geschenk.
  v_promo := new.raw_user_meta_data ->> 'promo_code';

  if v_promo is not null then
    select p.tage into v_tage
    from public.premium_promo_codes p
    where p.code = v_promo and p.aktiv;

    if v_tage is not null then
      begin
        insert into public.premium_gratis (user_id, code, gueltig_ab, gueltig_bis)
        values (new.id, v_promo, now(), now() + make_interval(days => v_tage))
        on conflict do nothing;

        update public.profiles
        set ist_premium = true
        where id = new.id and ist_premium is distinct from true;
      exception
        when others then
          raise warning 'Promo-Premium fuer % konnte nicht vergeben werden: %', new.id, sqlerrm;
      end;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Legt bei jeder Neuregistrierung das Profil an, haelt seit 0088 die Creator-Herkunft fest (seit 0094 ohne sie je abzubrechen) und vergiebt seit 0121 Gratis-Premium, sofern raw_user_meta_data.promo_code einen aktiven Code aus premium_promo_codes nennt. Beide Codes werden hier geprueft, weil die Metadaten client-setzbar sind.';

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- apply_subscription_state: Koerper aus 0110, Projektion um Gratis erweitert
-- ---------------------------------------------------------------------------
--
-- Ein Stripe-Ereignis (z. B. ein unvollstaendiges Abo) nimmt Gratis nicht
-- weg, solange es laeuft. Die Identitaetspruefung aus 0062 rechnet bewusst
-- weiter nur mit dem Abo (v_ist_premium): ein laufendes Gratis darf nicht
-- dazu fuehren, dass ein fremdes, beendetes Abo ein laufendes ueberschreibt.

create or replace function public.apply_subscription_state(
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_price_id text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_stripe_fetched_at timestamptz,
  p_kulanz_aktion text default 'unveraendert',
  p_kulanz_invoice_id text default null,
  p_kulanz_tage integer default 7
) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_vorher public.subscriptions%rowtype;
  v_kulanz_bis timestamptz;
  v_kulanz_invoice_id text;
  v_ist_premium boolean;
  -- Seit 0110: was in profiles.ist_premium landet. v_ist_premium bleibt die
  -- Aussage ueber das ABO allein (0062). Seit 0121 zaehlt zusaetzlich das
  -- Gratis-Premium.
  v_projektion boolean;
begin
  if p_kulanz_aktion not in ('unveraendert', 'setzen', 'loeschen') then
    raise exception 'unbekannte kulanz_aktion: %', p_kulanz_aktion;
  end if;

  select id into v_user_id
  from public.profiles
  where stripe_customer_id = p_stripe_customer_id;

  if v_user_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select * into v_vorher from public.subscriptions where user_id = v_user_id;

  if v_vorher.user_id is not null and p_stripe_fetched_at < v_vorher.stripe_updated_at then
    return false;
  end if;

  v_kulanz_bis := v_vorher.kulanz_bis;
  v_kulanz_invoice_id := v_vorher.kulanz_invoice_id;

  if p_kulanz_aktion = 'setzen' then
    if v_kulanz_bis is null or v_kulanz_invoice_id is distinct from p_kulanz_invoice_id then
      v_kulanz_bis := now() + make_interval(days => p_kulanz_tage);
      v_kulanz_invoice_id := p_kulanz_invoice_id;
    end if;
  elsif p_kulanz_aktion = 'loeschen' then
    if v_kulanz_invoice_id is not distinct from p_kulanz_invoice_id then
      v_kulanz_bis := null;
      v_kulanz_invoice_id := null;
    end if;
  end if;

  if p_status <> 'past_due' then
    v_kulanz_bis := null;
    v_kulanz_invoice_id := null;
  end if;

  v_ist_premium := public.subscription_ist_premium(p_status, v_kulanz_bis);

  if v_vorher.user_id is not null
     and v_vorher.stripe_subscription_id is distinct from p_stripe_subscription_id
     and public.subscription_ist_premium(v_vorher.status, v_vorher.kulanz_bis)
     and not v_ist_premium then
    return false;
  end if;

  insert into public.subscriptions as s (
    user_id, stripe_subscription_id, stripe_customer_id, status, price_id,
    current_period_end, cancel_at_period_end, kulanz_bis, kulanz_invoice_id,
    stripe_updated_at, updated_at
  ) values (
    v_user_id, p_stripe_subscription_id, p_stripe_customer_id, p_status, p_price_id,
    p_current_period_end, p_cancel_at_period_end, v_kulanz_bis, v_kulanz_invoice_id,
    p_stripe_fetched_at, now()
  )
  on conflict (user_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_customer_id = excluded.stripe_customer_id,
    status = excluded.status,
    price_id = excluded.price_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    kulanz_bis = excluded.kulanz_bis,
    kulanz_invoice_id = excluded.kulanz_invoice_id,
    stripe_updated_at = excluded.stripe_updated_at,
    updated_at = now();

  -- Die einzige Aenderung gegenueber 0110: ein beendetes Abo nimmt Premium
  -- nicht weg, solange ein Gratis laeuft — wie zuvor schon beim Pass.
  v_projektion := v_ist_premium
    or public.saisonpass_gueltig(v_user_id)
    or public.premium_gratis_gueltig(v_user_id);

  update public.profiles
  set ist_premium = v_projektion
  where id = v_user_id and ist_premium is distinct from v_projektion;

  if not v_projektion then
    update public.profiles
    set zeigt_premium_badge = false
    where id = v_user_id and zeigt_premium_badge = true;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- saisonpass_erstatten: Koerper aus 0110, Soll um Gratis erweitert
-- ---------------------------------------------------------------------------
--
-- Eine Erstattung nimmt Premium nicht weg, solange ein Gratis laeuft —
-- derselbe Grund wie in apply_subscription_state darueber.

create or replace function public.saisonpass_erstatten(p_stripe_payment_intent_id text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_abo public.subscriptions%rowtype;
  v_soll boolean;
begin
  select user_id into v_user_id
  from public.saisonpaesse
  where stripe_payment_intent_id = p_stripe_payment_intent_id;

  if v_user_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  update public.saisonpaesse
  set erstattet_am = coalesce(erstattet_am, now())
  where stripe_payment_intent_id = p_stripe_payment_intent_id;

  select * into v_abo from public.subscriptions where user_id = v_user_id;

  v_soll := coalesce(public.subscription_ist_premium(v_abo.status, v_abo.kulanz_bis), false)
    or public.saisonpass_gueltig(v_user_id)
    or public.premium_gratis_gueltig(v_user_id);

  update public.profiles
  set ist_premium = v_soll
  where id = v_user_id and ist_premium is distinct from v_soll;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- premium_abgleich: Koerper aus 0110, um die Gratis-Inhaber erweitert
-- ---------------------------------------------------------------------------
--
-- Ein Gratis loest an seinem Ende kein Stripe-Ereignis aus — ohne diese
-- Erweiterung bliebe Premium nach Ablauf fuer immer an (derselbe Grund, aus
-- dem 0110 die Pass-Inhaber aufgenommen hat).
--
-- Unveraendert: wer weder Abo noch Pass noch Gratis hat (Premium von Hand
-- gesetzt), wird nicht angefasst.

create or replace function public.premium_abgleich()
returns table (user_id uuid, ist_premium_neu boolean)
language sql
set search_path = public, pg_temp
as $$
  with personen as (
    select s.user_id from public.subscriptions s
    union
    select p.user_id from public.saisonpaesse p
    union
    select g.user_id from public.premium_gratis g
  ),
  soll as (
    select
      personen.user_id,
      coalesce(public.subscription_ist_premium(s.status, s.kulanz_bis), false)
        or public.saisonpass_gueltig(personen.user_id)
        or public.premium_gratis_gueltig(personen.user_id) as ist_premium_neu
    from personen
    left join public.subscriptions s on s.user_id = personen.user_id
  ),
  geaendert as (
    update public.profiles p
    set ist_premium = soll.ist_premium_neu,
        zeigt_premium_badge = case
          when soll.ist_premium_neu then p.zeigt_premium_badge
          else false
        end
    from soll
    where p.id = soll.user_id
      and p.geloescht_am is null
      and p.ist_premium is distinct from soll.ist_premium_neu
    returning p.id, p.ist_premium
  )
  select id, ist_premium from geaendert;
$$;

-- ---------------------------------------------------------------------------
-- anonymize_account: Rumpf aus 0120, loescht zusaetzlich die Gratis-Zeile
-- ---------------------------------------------------------------------------
--
-- Ohne das ueberlebte die Zeile die Loeschung — und premium_abgleich wuerde
-- fuer das anonymisierte Profil Premium zurueckholen (derselbe Grund, aus
-- dem 0076 die Abo-Zeile und 0110 die Paesse loeschen).

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
    tempoprofil = null,
    hoehen_quelle = null,
    ist_oeffentlich = case when art = 'frei' then false else ist_oeffentlich end
  where user_id = p_user_id;

  delete from public.vehicles where user_id = p_user_id;

  delete from public.subscriptions where user_id = p_user_id;

  delete from public.saisonpaesse where user_id = p_user_id;

  -- Neu in 0121. Wie Abo und Pass: ohne das stellt premium_abgleich()
  -- ist_premium aus der stehengebliebenen Zeile wieder her.
  delete from public.premium_gratis where user_id = p_user_id;

  delete from public.registrierung_herkunft where user_id = p_user_id;

  update public.creator_konversionen
  set user_id = null
  where user_id = p_user_id;

  update public.creator_links
  set creator_user_id = null
  where creator_user_id = p_user_id;

  delete from public.fahrt_starts
   where user_id = p_user_id
      or eingeloest_von = p_user_id;

  delete from public.pass_folgen where user_id = p_user_id;
end;
$$;

comment on function public.anonymize_account(uuid) is
  'Anonymisiert ein Konto anhand der uebergebenen ID. Nur fuer service_role — der Aufrufer muss die Identitaet bereits festgestellt haben (deleteAccount() in lib/actions/auth.ts: Passwort-Neueingabe, dann Stripe-Kuendigung, dann diese Funktion mit der getUser()-ID). Loescht seit 0076 die subscriptions-Zeile, seit 0090 die Creator-Herkunft (in creator_konversionen wird nur der Personenbezug genullt), gibt seit 0092 zugewiesene Creator-Codes wieder frei, loescht seit 0101 die Fahrtstarts, seit der Paesse-Migration die gefolgten Paesse, seit 0110 die Saisonpaesse, seit 0115 das Tempoprofil der Fahrten, seit 0120 deren Hoehenherkunft und seit 0121 vergebenes Gratis-Premium.';

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
--
-- Alle Rollen ausdruecklich. Ein `revoke ... from public` allein laesst den
-- direkten anon-Grant stehen, den Supabase jeder neuen Funktion in public
-- mitgibt — die Falle aus 0047, 0048, 0091 und 0097. `create or replace`
-- behaelt die bestehenden Rechte einer Funktion; sie hier trotzdem zu
-- wiederholen kostet nichts und macht die Datei fuer sich lesbar (0110).

revoke execute on function public.premium_gratis_gueltig(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) from public, anon, authenticated;
revoke execute on function public.saisonpass_erstatten(text) from public, anon, authenticated;
revoke execute on function public.premium_abgleich() from public, anon, authenticated;
revoke execute on function public.anonymize_account(uuid) from public, anon, authenticated;

grant execute on function public.premium_gratis_gueltig(uuid) to service_role;
grant execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) to service_role;
grant execute on function public.saisonpass_erstatten(text) to service_role;
grant execute on function public.premium_abgleich() to service_role;
grant execute on function public.anonymize_account(uuid) to service_role;
