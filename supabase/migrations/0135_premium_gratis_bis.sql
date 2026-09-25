-- 0135: Bis wann laeuft das eigene Gratis-Premium? (Lesefunktion)
--
-- WARUM
--
-- Wer ueber den Signup-Link (0121) sieben Tage Premium bekommen hat, galt
-- in lib/premium.ts als quelle = "manuell": profiles.ist_premium ist true,
-- aber es gibt weder Abo- noch Pass-Zeile. Die Folgen: beide Kaufseiten
-- leiteten auf /profil um, die oeffentliche /premium zeigte "Zum Profil",
-- und die Abo-Seite bot "Abo verwalten" an — fuer ein Konto ohne
-- Stripe-Customer, das der Portal-Knopf stumm auf /profil zurueckwirft.
-- Ausgerechnet die Leute, die der Link zum Kauf fuehren soll, konnten
-- nicht kaufen.
--
-- Die App muss dafuer das Enddatum lesen. premium_gratis hat bewusst keine
-- Grants und keine Policy (0121, dieselbe Linie wie registrierung_herkunft);
-- statt den Service-Role-Client in getPremiumStatus() zu holen — der dort
-- ausdruecklich nicht hingehoert — gibt diese Funktion genau eine Zahl
-- heraus: das Ende des EIGENEN, gerade laufenden Gratis-Premiums, gebunden
-- an auth.uid(). Kein Parameter, also keine fremde user_id abfragbar.
--
-- GEMESSEN (2026-09-25, SELECT auf Produktion): premium_gratis hat RLS an,
-- keine Policy, keine Tabellenrechte fuer anon/authenticated;
-- premium_gratis_gueltig(uuid) ist nur fuer service_role ausfuehrbar.
--
-- DIE APP OHNE DIESE MIGRATION
--
-- lib/premium.ts faengt den Fehler "Funktion unbekannt" ab und faellt auf
-- das bisherige Verhalten zurueck (quelle "manuell"). Der Code darf also vor
-- der Migration ausgeliefert werden.
--
-- PRUEFUNG nach dem Einspielen:
--   select has_function_privilege('anon', 'public.premium_gratis_bis()', 'execute') as anon,
--          has_function_privilege('authenticated', 'public.premium_gratis_bis()', 'execute') as authenticated;
--   -- erwartet: anon false, authenticated true
--   select prosecdef, proconfig from pg_proc where proname = 'premium_gratis_bis';
--   -- erwartet: true, {search_path=public, pg_temp}
--
-- DER WEG ZURUECK
--   drop function public.premium_gratis_bis();
-- (lib/premium.ts faellt dann wieder auf "manuell" zurueck.)

create or replace function public.premium_gratis_bis()
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Dieselbe Bedingung wie premium_gratis_gueltig (0121), nur fuer die
  -- aufrufende Person und mit dem Enddatum statt eines Ja/Nein. Ohne
  -- Anmeldung ist auth.uid() null und das Ergebnis ebenfalls.
  select g.gueltig_bis
  from public.premium_gratis g
  where g.user_id = (select auth.uid())
    and g.gueltig_ab <= now()
    and now() < g.gueltig_bis;
$$;

comment on function public.premium_gratis_bis() is
  'Ende des eigenen, gerade laufenden Gratis-Premiums (0121) oder null. Nur fuer die aufrufende Person (auth.uid()), gelesen von getPremiumStatus() in lib/premium.ts, damit Promo-Konten als quelle "gratis" statt "manuell" erscheinen und kaufen koennen (0135).';

-- Supabase gibt neuen Funktionen in public direkte Rechte an anon — ein
-- revoke from public allein laesst den stehen (0047, 0091, 0097).
revoke execute on function public.premium_gratis_bis() from public, anon;
grant execute on function public.premium_gratis_bis() to authenticated;
