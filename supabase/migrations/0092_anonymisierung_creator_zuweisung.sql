-- =====================================================================
-- Kontolöschung: die Creator-Zuweisung geht mit, der Code bleibt.
--
-- 0091 hängt einen Code an ein Konto (creator_links.creator_user_id).
-- Wird dieses Konto gelöscht, muss der Zeiger weg — aber nicht der Code:
-- der steht draussen in einer Caption und wird weiter angeklickt. Er
-- läuft danach wie jeder Code ohne zugewiesenes Konto weiter, und die
-- Moderation kann ihn deaktivieren oder neu vergeben.
--
-- Wie schon bei 0090 gilt: on delete set null feuert hier nie, weil
-- deleteAccount() die Zeile in auth.users nicht löscht, sondern das Konto
-- anonymisiert und die Zugangsdaten entwertet. Also ausgeschrieben.
--
-- 0076 und 0090 werden nicht angefasst (Kernregel 9). Der Rumpf unten ist
-- der von 0090, wortgleich, plus die letzte Anweisung.
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

  -- Seit 0090 — beides idempotent, wie die ganze Funktion:
  -- ein zweiter Durchlauf trifft keine Zeile mehr und ist folgenlos.
  delete from public.registrierung_herkunft where user_id = p_user_id;

  update public.creator_konversionen
  set user_id = null
  where user_id = p_user_id;

  -- Neu in 0092: die Codes selbst bleiben stehen und laufen weiter, nur
  -- ohne Besitzer. Damit verliert das gelöschte Konto zugleich den
  -- Zugang zu /creator — die Seite kennt keine andere Berechtigung als
  -- diese Spalte.
  update public.creator_links
  set creator_user_id = null
  where creator_user_id = p_user_id;
end;
$$;

comment on function public.anonymize_account(uuid) is
  'Anonymisiert ein Konto anhand der uebergebenen ID. Nur fuer service_role — der Aufrufer muss die Identitaet bereits festgestellt haben (deleteAccount() in lib/actions/auth.ts: Passwort-Neueingabe, dann Stripe-Kuendigung, dann diese Funktion mit der getUser()-ID). Loescht seit 0076 die subscriptions-Zeile, seit 0090 die Creator-Herkunft (in creator_konversionen wird nur der Personenbezug genullt) und gibt seit 0092 zugewiesene Creator-Codes wieder frei.';

-- Zusicherung, keine Reparatur: create or replace laesst die
-- Ausfuehrungsrechte unveraendert, die 0076 gesetzt hat.
revoke execute on function public.anonymize_account(uuid) from public;
revoke execute on function public.anonymize_account(uuid) from anon;
revoke execute on function public.anonymize_account(uuid) from authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;
