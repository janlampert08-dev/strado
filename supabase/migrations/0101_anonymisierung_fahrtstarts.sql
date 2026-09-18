-- =====================================================================
-- Kontolöschung: die Fahrtstarts gehen mit.
--
-- 0096 legt fahrt_starts an, 0098 hängt eine Position daran
-- (letzter_puls_punkt) — ein GPS-Fix wie jeder andere. anonymize_account
-- fasst die Tabelle bis hierher nicht an, weil sie nach 0092 entstanden
-- ist und niemand die Funktion nachgezogen hat.
--
-- Die Fremdschlüssel aus 0096 helfen nicht. fahrt_starts.user_id und
-- .eingeloest_von tragen beide `on delete cascade` — aber deleteAccount()
-- (lib/actions/auth.ts) LÖSCHT die Zeile in auth.users nicht, sondern
-- anonymisiert das Konto und entwertet die Zugangsdaten per
-- updateUserById(). Die Kaskade feuert deshalb nie. Genau diesen Satz
-- schreiben 0090 und 0092 schon in ihre Köpfe; 0096 hat ihn nicht
-- gelesen. Also auch hier ausgeschrieben.
--
-- Warum das mehr ist als Aufräumen: dieselbe Funktion setzt zwei
-- Anweisungen weiter oben route_completions.track auf NULL, entfernt die
-- Spur der Fahrt also ausdrücklich. Eine Position aus derselben Fahrt in
-- einer Nebentabelle stehen zu lassen, widerspricht dem — und die
-- veröffentlichte Datenschutzerklärung sagt zu, die letzte Meldung werde
-- „mit dem Konto gelöscht". Ohne diese Migration ist das eine Zusage, die
-- der Code nicht hält.
--
-- Beide Spalten, nicht nur user_id: ein Gast zeichnet ohne Konto auf
-- (user_id NULL) und meldet sich zwischen Start und Speichern an — dann
-- steht die Person nur in eingeloest_von. Wer die Zeile über die eine
-- Spalte löscht und die andere vergisst, lässt genau den Fall stehen, für
-- den 0096 die zweite Spalte überhaupt eingeführt hat.
--
-- route_completions.fahrt_start_id zeigt mit `on delete set null` hierher
-- (0096). Die gelöschte Zeile nullt dort also den Zeiger; die Fahrt selbst
-- bleibt. Ihre Wertung verliert sie dabei nicht zusätzlich — der Trigger
-- aus 0098 stuft sie ohnehin auf dauer_quelle = 'trail' zurück, sobald
-- track NULL ist, und das passiert in derselben Funktion.
--
-- Gast-Zeilen ohne Konto (user_id und eingeloest_von beide NULL) fasst
-- diese Migration NICHT an — für sie gibt es keine Kontolöschung, an der
-- sie hängen könnten. Sie räumt der Lauf in fahrt_start_anlegen (0096)
-- ab. Dass dieser Lauf hinter `random() < 0.02` hängt und damit keine
-- Frist zusichert, ist bekannt und in der Datenschutzerklärung
-- entsprechend vorsichtig formuliert ("in der Regel"); wer daraus eine
-- echte Frist machen will, braucht einen Cron wie premium_abgleich()
-- (0059) — das ist eine eigene Entscheidung, keine Nacharbeit zu dieser.
--
-- 0076, 0090 und 0092 werden nicht angefasst (Kernregel 9). Der Rumpf
-- unten ist der von 0092, wortgleich, plus die eine neue Anweisung. Er
-- wurde vor dem Schreiben aus der Produktionsdatenbank ausgelesen und
-- gegen 0092 verglichen — Anweisung für Anweisung deckungsgleich, keine
-- Abweichung, die ein `create or replace` hier still zurückdrehen würde.
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

  -- Seit 0092: die Codes selbst bleiben stehen und laufen weiter, nur
  -- ohne Besitzer. Damit verliert das gelöschte Konto zugleich den
  -- Zugang zu /creator — die Seite kennt keine andere Berechtigung als
  -- diese Spalte.
  update public.creator_links
  set creator_user_id = null
  where creator_user_id = p_user_id;

  -- Neu in 0101: der serverseitige Fahrtstart samt letzter Position.
  -- Ganz löschen statt nullen — anders als bei creator_konversionen, wo
  -- die Zeile als Zählwert für die Creatorin weiterlebt und nur der
  -- Personenbezug fällt, hat eine Ticketzeile ohne Konto keinen Wert:
  -- sie ist eingelöst oder wertlos, und die Fahrt trägt ihre Dauer
  -- ohnehin in route_completions.dauer_sekunden.
  delete from public.fahrt_starts
   where user_id = p_user_id
      or eingeloest_von = p_user_id;
end;
$$;

comment on function public.anonymize_account(uuid) is
  'Anonymisiert ein Konto anhand der uebergebenen ID. Nur fuer service_role — der Aufrufer muss die Identitaet bereits festgestellt haben (deleteAccount() in lib/actions/auth.ts: Passwort-Neueingabe, dann Stripe-Kuendigung, dann diese Funktion mit der getUser()-ID). Loescht seit 0076 die subscriptions-Zeile, seit 0090 die Creator-Herkunft (in creator_konversionen wird nur der Personenbezug genullt), gibt seit 0092 zugewiesene Creator-Codes wieder frei und loescht seit 0101 die Fahrtstarts samt letzter Positionsmeldung.';

-- Zusicherung, keine Reparatur: create or replace laesst die
-- Ausfuehrungsrechte unveraendert, die 0076 gesetzt hat.
revoke execute on function public.anonymize_account(uuid) from public;
revoke execute on function public.anonymize_account(uuid) from anon;
revoke execute on function public.anonymize_account(uuid) from authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;
