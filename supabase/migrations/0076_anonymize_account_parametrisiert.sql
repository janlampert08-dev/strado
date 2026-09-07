-- =====================================================================
-- Kontolöschung: parametrisierte Anonymisierung, nur für service_role.
--
-- Befund N5 aus docs/audit/2026-09-07-followup.md.
--
-- ---------------------------------------------------------------------
-- Das Problem
-- ---------------------------------------------------------------------
-- anonymize_own_account() ist direkt an authenticated gegrantet
-- (0042:67, erneut 0045:203, 0047:47, 0048:25, 0058:120). Ein
-- POST /rest/v1/rpc/anonymize_own_account ist damit von jedem
-- angemeldeten Client aufrufbar und umgeht beide Zusicherungen, die
-- deleteAccount() gibt:
--
--   1. die Passwort-Neueingabe, die lib/actions/auth.ts ausdrücklich
--      verlangt, weil eine unbeaufsichtigt offene Sitzung sonst mit
--      einem Klick das Konto deaktivieren könnte;
--   2. kuendigeStripeAbo(), das die Löschung abbricht, wenn die
--      Kündigung nicht sicher gelungen ist.
--
-- Zusätzlich lässt die heutige Fassung (0045) die Zeile in
-- subscriptions stehen. premium_abgleich() (0059, per Cron) rekonstruiert
-- daraus profiles.ist_premium — das anonymisierte Konto wird also
-- nachts wieder auf Premium gesetzt, während Stripe weiter abbucht.
--
-- Der App-Pfad ist gut gebaut. Er ist nur nicht der einzige.
--
-- ---------------------------------------------------------------------
-- Warum der Grant hier NICHT entzogen wird
-- ---------------------------------------------------------------------
-- Ein blosses "revoke execute ... from authenticated" würde den einzigen
-- legitimen Löschpfad mitreissen: lib/actions/auth.ts ruft die RPC über
-- den session-gebundenen Client auf, und die Funktion hat keinen
-- Parameter, weil sie sich über auth.uid() selbst bindet. Legitimer und
-- illegitimer Aufruf hängen heute am selben Recht — das ist der Befund.
--
-- Die Trennung muss vor dem Entzug stehen, und der Entzug erst nach dem
-- Deployment des neuen Aufrufers. Drei Schritte in drei getrennten
-- Momenten, deren mittlerer keine Migration ist:
--
--   1. DIESE Migration: anonymize_account(p_user_id) anlegen,
--      auf service_role beschränken, anonymize_own_account zur dünnen
--      Hülle darüber machen.
--   2. Deployment des umgebauten deleteAccount(), das die neue Funktion
--      über den Admin-Client aufruft — plus eine echte Testlöschung.
--   3. Erst danach: supabase/migrations/ausstehend/
--      anonymize_own_account_grant_entziehen.sql einspielen.
--
-- Schritt 3 liegt bewusst ausserhalb dieses Verzeichnisses, damit
-- "supabase db push" ihn nicht mitnimmt. Eine gemeinsame Migration wäre
-- keine Lösung: sie wäre in der Datenbank atomar und würde am
-- Deployment-Zeitpunkt der Anwendung nichts ändern.
--
-- ---------------------------------------------------------------------
-- geloescht_am: die Spalte wird hier mit angelegt
-- ---------------------------------------------------------------------
-- 0058_kontoloeschung_werte_nullen.sql enthält die inhaltlich bessere
-- Fassung der Anonymisierung — display_name = null statt des
-- Platzhalters "Gelöschtes Konto", stripe_customer_id genullt, und ein
-- geloescht_am, das per coalesce beim zweiten Aufruf stehen bleibt.
-- lib/accountDeletion.test.ts prüft genau diese Semantik.
--
-- Eingespielt ist 0058 trotzdem nicht: Es setzt profiles.geloescht_am
-- voraus, das 0042 mitbrächte, und 0042 wurde bewusst ausgelassen (es
-- würde die Funktion auf einen älteren Stand zurücksetzen, siehe
-- README.md). Ein Henne-Ei-Zustand, der die bessere Fassung seit
-- Wochen blockiert.
--
-- Diese Migration löst ihn, indem sie die Spalte selbst anlegt —
-- "if not exists", damit sie auch dann durchläuft, wenn 0042 oder 0058
-- doch schon gelaufen sind. Danach trägt anonymize_account() die
-- vollständige 0058-Semantik, ohne von jener Datei abzuhängen.
--
-- Folge für die Reihenfolge in deleteAccount(): stripe_customer_id wird
-- ab jetzt tatsächlich genullt. Die Kündigung MUSS davor laufen, sonst
-- findet kuendigeStripeAbo() keinen Kunden mehr, meldet Erfolg und
-- lässt ein laufendes Abo zurück. deleteAccount() macht das bereits
-- richtig; ab dieser Migration ist es nicht mehr nur richtig, sondern
-- zwingend.
--
-- Ebenfalls NICHT hier: ein geloescht_am-Filter auf premium_abgleich().
-- Das Löschen der subscriptions-Zeile unten ist die wirksamere Sperre —
-- ohne Zeile gibt es nichts zu rekonstruieren.
-- =====================================================================

-- ---------------------------------------------------------------------------
-- Die Spalte, an der 0058 hängt. "if not exists", damit diese Migration
-- unabhängig davon läuft, ob 0042/0058 je nachgezogen werden.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists geloescht_am timestamptz;

comment on column public.profiles.geloescht_am is
  'Zeitpunkt der Kontoloeschung (null = aktives Konto). Gesetzt von anonymize_account(); haelt fest, DASS geloescht wurde, nachdem der Platzhaltername "Geloeschtes Konto" durch display_name = null ersetzt wurde. Bewusst ohne Spalten-Grant an anon/authenticated (siehe 0034), nur serverseitig gedacht. In 0058 vorgesehen, dort wegen der Abhaengigkeit von 0042 nie eingespielt — mit 0076 nachgeholt.';

-- ---------------------------------------------------------------------------
-- Die parametrisierte Fassung. Inhaltlich identisch zu 0045, mit zwei
-- Ergänzungen: p_user_id statt auth.uid(), und das Löschen der
-- Abo-Zeile.
--
-- auth.uid() darf im Rumpf NICHT mehr vorkommen: unter einem
-- service_role-Aufruf ist es NULL, jedes darauf gefilterte Statement
-- träfe also keine Zeile — die Funktion liefe fehlerfrei durch und
-- hätte nichts getan.
-- ---------------------------------------------------------------------------
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
    -- coalesce statt now(): Die Funktion ist idempotent, und
    -- deleteAccount() darf sie nach einem Fehlschlag des Folgeschritts
    -- erneut auslaufen lassen. Der ursprüngliche Löschzeitpunkt bleibt
    -- dabei stehen.
    geloescht_am = coalesce(geloescht_am, now())
  where id = p_user_id;

  update public.route_completions
  set
    track = null,
    track_oeffentlich = null,
    ist_oeffentlich = case when art = 'frei' then false else ist_oeffentlich end
  where user_id = p_user_id;

  delete from public.vehicles where user_id = p_user_id;

  -- Neu gegenüber 0045: ohne das rekonstruiert premium_abgleich() (0059)
  -- ist_premium aus der stehengebliebenen Zeile und setzt das gelöschte
  -- Konto nachts wieder auf Premium.
  delete from public.subscriptions where user_id = p_user_id;
end;
$$;

comment on function public.anonymize_account(uuid) is
  'Anonymisiert ein Konto anhand der uebergebenen ID. Nur fuer service_role — der Aufrufer muss die Identitaet bereits festgestellt haben (deleteAccount() in lib/actions/auth.ts: Passwort-Neueingabe, dann Stripe-Kuendigung, dann diese Funktion mit der getUser()-ID). Loescht seit 0076 zusaetzlich die subscriptions-Zeile, weil premium_abgleich() sonst nachts ist_premium daraus wiederherstellt.';

-- Reihenfolge und Vollständigkeit sind hier der Punkt: Postgres vergibt
-- EXECUTE auf eine neue Funktion standardmässig an PUBLIC. Ein blosses
-- "grant to service_role" liesse sie damit für alle aufrufbar. Und ein
-- Widerruf von PUBLIC entfernt keine direkten Grants an anon oder
-- authenticated — dieselbe Lektion steht in 0047 (PUBLIC-Default) und
-- 0048 (direkte anon-Grants, die 0047 nicht erwischt hat).
revoke execute on function public.anonymize_account(uuid) from public;
revoke execute on function public.anonymize_account(uuid) from anon;
revoke execute on function public.anonymize_account(uuid) from authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- anonymize_own_account() wird zur dünnen Hülle. Damit gibt es genau
-- eine Implementierung, die richtig bleiben muss.
--
-- Der Grant an authenticated bleibt hier UNVERÄNDERT bestehen: solange
-- der alte Aufrufer ausgerollt ist, braucht er ihn. Entzogen wird er in
-- supabase/migrations/ausstehend/, nach dem Deployment.
--
-- security definer bleibt, weil der Aufrufer keine Schreibrechte auf
-- fremde profiles-Zeilen hat und auch auf die eigene nicht in diesem
-- Umfang. Die Bindung an die eigene Identität macht der auth.uid()-Check
-- direkt darüber — der Parameter kommt nicht von aussen.
-- ---------------------------------------------------------------------------
create or replace function public.anonymize_own_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform public.anonymize_account(auth.uid());
end;
$$;

comment on function public.anonymize_own_account() is
  'Duenne Huelle um anonymize_account(auth.uid()) — seit 0076 gibt es nur noch eine Implementierung. Diese Fassung ist ein Uebergangszustand: sie ist weiterhin an authenticated gegrantet und umgeht damit die Passwort-Neueingabe und die Stripe-Kuendigung aus deleteAccount(). Der Entzug liegt in supabase/migrations/ausstehend/ und gehoert NACH dem Deployment des umgebauten deleteAccount() eingespielt, nicht davor.';
