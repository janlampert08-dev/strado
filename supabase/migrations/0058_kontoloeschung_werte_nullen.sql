-- Kontolöschung: Werte nullen statt Ersatzwerte setzen.
--
-- Die Grundentscheidung von 0042 bleibt unverändert: der auth.users-Datensatz
-- wird nicht gelöscht (jede Cascade würde Fahrten/Bewertungen/Kudos/Follows
-- mitreissen und damit Bestenlisten und Statistiken zerreissen), und 0045 hat
-- das um die GPS-Tracks ergänzt. Diese Migration dreht davon nichts um, sie
-- macht nur die Anonymisierung selbst konsequent: jede Profilspalte, die
-- einen vom Nutzer stammenden Wert trägt, wird auf null gesetzt statt auf
-- einen Ersatzwert — ein Konto wird "geleert", nicht gelöscht.
--
-- Was sich gegenüber 0045 ändert:
--
--  1. display_name = null statt 'Gelöschtes Konto'. Der Platzhalter war
--     selbst noch ein gesetzter Wert: er lief durch jede Leseschicht als
--     wäre er ein echter Name (Feed, Bestenlisten, Bewertungen, öffentliches
--     Profil) und blieb über die Namenssuche auffindbar. null ist der Fall,
--     den display_name seit 0001 ohnehin zulässt und den jede Leseschicht
--     bereits abfängt ("Anonym"/"Fahrer", siehe lib/leaderboard.ts,
--     app/feed/page.tsx, app/fahrer/[id]/page.tsx). Die Namenssuche
--     (lib/actions/profile.ts) filtert display_name is null schon heute
--     heraus — gelöschte Konten fallen damit von selbst aus ihr heraus.
--  2. stripe_customer_id = null. Die Spalte ist ein Zeiger auf einen
--     Stripe-Customer, der dort mit E-Mail und Name hinterlegt ist, also
--     selbst ein personenbezogenes Datum. Sie hat nach der Löschung keinen
--     Zweck mehr: ist_premium ist aus, das Kundenportal ist ohne Zugang zum
--     Konto nicht mehr erreichbar, und der Webhook (app/api/stripe/webhook)
--     würde über eine genullte Spalte schlicht keine Zeile mehr treffen —
--     er setzt ausschliesslich ist_premium, das hier bereits false ist.
--     Ein etwaiges laufendes Abo kündigt diese Funktion NICHT; das war auch
--     vorher nicht so und ist eine bewusst offen gelassene Lücke (die
--     Premium-UI ist derzeit ohnehin deaktiviert, siehe PremiumCard.tsx).
--  3. geloescht_am hält als einziger neu gesetzter Wert fest, DASS gelöscht
--     wurde. Ohne diesen Zeitstempel wäre ein geleertes Profil von einem
--     frisch angelegten ohne Namen nicht mehr zu unterscheiden — die
--     Information steckte bisher im Platzhalternamen, der jetzt wegfällt.
--     Bewusst reine Metadaten (kein Personenbezug) und ohne Spalten-Grant:
--     0034 hat die Tabellen-Grants auf profiles entzogen, eine neue Spalte
--     ist damit für anon/authenticated weder les- noch schreibbar, und
--     gebraucht wird sie nur serverseitig.
--
-- Bewusst NICHT genullt:
--  - id / created_at: not null und ohne Personenbezug. id ist die reine
--    Fremdschlüssel-Klammer, an der die erhalten bleibenden Fahrten hängen.
--  - Die Sichtbarkeits- und Status-Flags (zeigt_*, is_moderator,
--    ist_premium): allesamt not null. false ist hier der neutrale
--    Aus-Zustand und das strengere Ergebnis — nichts wird mehr angezeigt.
--  - privatzone_radius_m: not null, und 0 hiesse "Privatzone aus", wäre also
--    das Gegenteil von neutral. Der Wert bestimmt, wie weit Start und Ziel
--    aus einem geteilten Track herausgeschnitten werden (lib/track.ts,
--    cropTrackEnds); ihn beim Löschen auf 0 zu setzen könnte bei einer
--    späteren Neuberechnung die Haustür wieder freilegen. Er bleibt stehen.
--  - kudos_gesehen_am: not null, kein vom Nutzer eingegebener Wert, ohne
--    Spalten-Grant (0053) nicht auslesbar.
--  - vehicles: bleiben gelöscht wie seit 0042. typ/marke/modell/getriebe
--    sind not null — eine Zeile "nullen" geht dort gar nicht, und die
--    Fahrzeuge stehen über public_fahrten neben jeder öffentlichen Fahrt.
--    route_completions.fahrzeug_id ist "on delete set null" (0001), die
--    Fahrten selbst bleiben also erhalten und verlieren nur den Bezug.

alter table public.profiles
  add column geloescht_am timestamptz;

comment on column public.profiles.geloescht_am is
  'Zeitpunkt der Kontolöschung (null = aktives Konto). Gesetzt von anonymize_own_account(); hält fest, DASS gelöscht wurde, nachdem 0058 den Platzhalternamen "Gelöschtes Konto" durch display_name = null ersetzt hat. Bewusst ohne Spalten-Grant an anon/authenticated (siehe 0034), nur serverseitig gedacht.';

-- SECURITY DEFINER weiterhin aus dem in 0042 beschriebenen Grund: 0034
-- beschränkt den UPDATE-Grant für authenticated auf eine feste Spaltenliste
-- ohne display_name/is_moderator/ist_premium/zeigt_follower_liste/
-- stripe_customer_id/geloescht_am — genau, damit ein normaler Client diese
-- Spalten nicht selbst setzen kann. Die Funktion umgeht das ausschliesslich
-- für den eigenen, über auth.uid() gebundenen Account (nicht mit fremder
-- user_id aufrufbar, auth.uid() ist vom Aufrufer nicht beeinflussbar) und
-- schreibt nur den hier fest codierten Zustand — sie nimmt keinen einzigen
-- Parameter entgegen.
create or replace function public.anonymize_own_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
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
    -- coalesce statt now(): bei einem zweiten Aufruf (die Funktion ist
    -- idempotent und lib/actions/auth.ts darf sie nach einem Fehlschlag
    -- des Folgeschritts erneut auslaufen lassen) bleibt der ursprüngliche
    -- Löschzeitpunkt stehen.
    geloescht_am = coalesce(geloescht_am, now())
  where id = auth.uid();

  -- Unverändert aus 0045: Geometrie entfernen und freie Fahrten privat
  -- stellen; Streckenfahrten bleiben öffentlich und damit in den
  -- Bestenlisten.
  update public.route_completions
  set
    track = null,
    track_oeffentlich = null,
    ist_oeffentlich = case when art = 'frei' then false else ist_oeffentlich end
  where user_id = auth.uid();

  delete from public.vehicles where user_id = auth.uid();
end;
$$;

grant execute on function public.anonymize_own_account() to authenticated;
