-- =====================================================================
-- Kontolöschung: die Herkunft geht, die Zählung bleibt.
--
-- 0087 hat zwei Tabellen angelegt, die beide auf ein Konto zeigen. Beim
-- Löschen dieses Kontos müssen sie unterschiedlich behandelt werden, und
-- genau darin liegt der Grund, warum es zwei sind:
--
--   * registrierung_herkunft sagt "dieser Mensch kam über Max". Das ist
--     eine Aussage über eine Person und verschwindet mit ihr.
--   * creator_konversionen sagt "Max hat am 3. März eine Registrierung
--     gebracht, aus der am 14. Mai ein Abo wurde". Nullt man dort den
--     Personenbezug, bleibt eine wahre Aussage über Max stehen, ohne
--     eine über den gelöschten Nutzer. Löschte man die Zeile stattdessen,
--     verlöre der Creator mit jedem gelöschten Konto eine Zählung, die
--     er verdient hat.
--
-- ---------------------------------------------------------------------
-- Warum das hier ausgeschrieben steht und nicht on delete erledigt
-- ---------------------------------------------------------------------
-- Weil die Automatik nie feuert. deleteAccount() in lib/actions/auth.ts
-- löscht die Zeile in auth.users NICHT: es ruft anonymize_account() und
-- entwertet danach die Zugangsdaten über admin.auth.admin.updateUserById
-- (neue E-Mail, neues Zufallspasswort). Ein on delete cascade / set null
-- auf auth.users (id) wartet auf ein DELETE, das in diesem Produkt nicht
-- stattfindet.
--
-- 0076 selbst wird nicht angefasst (Kernregel 9). Der Rumpf unten ist
-- deren Fassung, wortgleich, plus die beiden letzten Anweisungen.
-- create or replace setzt die ACL einer bestehenden Funktion nicht
-- zurück; die Entzüge aus 0076 gelten also weiter und stehen unten nur
-- als Zusicherung noch einmal.
-- =====================================================================

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

  -- Seit 0076: ohne das rekonstruiert premium_abgleich() (0059)
  -- ist_premium aus der stehengebliebenen Zeile und setzt das gelöschte
  -- Konto nachts wieder auf Premium.
  delete from public.subscriptions where user_id = p_user_id;

  -- Neu gegenüber 0076 — beides idempotent, wie die ganze Funktion:
  -- ein zweiter Durchlauf trifft keine Zeile mehr und ist folgenlos.
  delete from public.registrierung_herkunft where user_id = p_user_id;

  update public.creator_konversionen
  set user_id = null
  where user_id = p_user_id;
end;
$$;

comment on function public.anonymize_account(uuid) is
  'Anonymisiert ein Konto anhand der uebergebenen ID. Nur fuer service_role — der Aufrufer muss die Identitaet bereits festgestellt haben (deleteAccount() in lib/actions/auth.ts: Passwort-Neueingabe, dann Stripe-Kuendigung, dann diese Funktion mit der getUser()-ID). Loescht seit 0076 die subscriptions-Zeile (sonst stellt premium_abgleich() ist_premium nachts wieder her) und seit 0089 die Creator-Herkunft; in creator_konversionen wird nur der Personenbezug genullt, damit die Zaehlung des Creators bestehen bleibt.';

-- Zusicherung, keine Reparatur: create or replace laesst die
-- Ausfuehrungsrechte unveraendert, die 0076 gesetzt hat. Noch einmal
-- hingeschrieben, weil bei dieser Funktion ein versehentlich offenes
-- EXECUTE bedeutet, dass jeder jedes Konto loeschen kann.
revoke execute on function public.anonymize_account(uuid) from public;
revoke execute on function public.anonymize_account(uuid) from anon;
revoke execute on function public.anonymize_account(uuid) from authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;
