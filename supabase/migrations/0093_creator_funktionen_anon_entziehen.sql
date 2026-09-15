-- =====================================================================
-- creator_kennzahlen() und creator_verlauf(): das EXECUTE für anon
-- nachträglich entziehen.
--
-- 0091 schreibt für beide Funktionen:
--
--   revoke execute on function ... from public;
--   grant execute on function ... to authenticated;
--
-- und der Kommentar daneben behauptet, anon bekomme damit nichts. Nach
-- dem Einspielen am 2026-09-14 stand in der Datenbank trotzdem:
--
--   creator_kennzahlen -> {anon, authenticated, postgres, service_role}
--   creator_verlauf    -> {anon, authenticated, postgres, service_role}
--
-- Der Grund ist die Falle, wegen der 0047 und 0048 existieren, hier zum
-- dritten Mal: Supabase vergibt neuen Funktionen im Schema public per
-- Default-Privilegien einen **direkten** Grant an anon und authenticated.
-- Ein `revoke ... from public` entfernt nur das Recht, das PUBLIC hält —
-- den direkten Grant fasst es nicht an. 0047 hat das für PUBLIC gelernt,
-- 0048 für die direkten anon-Grants, die 0047 übrig liess. 0091 hat die
-- zweite Lektion nicht angewendet.
--
-- ---------------------------------------------------------------------
-- Was das offengelegt hat: nichts. Und warum es trotzdem weg muss
-- ---------------------------------------------------------------------
-- Beide Funktionen filtern auf `l.creator_user_id = (select auth.uid())`
-- oder darauf, dass der Aufrufer Moderator ist. Für anon ist auth.uid()
-- NULL, beide Bedingungen sind damit für jede Zeile falsch. Nachgemessen
-- statt geschlossen: als Rolle anon aufgerufen liefern beide **null
-- Zeilen**.
--
-- Der Entzug ist also keine Reparatur einer Lücke, sondern das
-- Wiederherstellen der Absicht. Er ist trotzdem kein Kosmetikpunkt: die
-- Filterbedingung ist heute das Einzige, was die Zahlen schützt. Sollte
-- jemand sie später lockern — etwa um öffentliche Codes ohne Anmeldung
-- auflösbar zu machen —, wäre ein liegengebliebener anon-Grant der
-- Unterschied zwischen einer internen Auswertung und einer öffentlichen.
-- Ein Recht, das niemand braucht, gehört entzogen, solange es folgenlos
-- ist.
--
-- creator_klick_zaehlen() behält seinen anon-Grant: dort ist er
-- ausdrücklich gewollt, weil der Klickende meistens kein Konto hat
-- (Begründung in 0091).
-- =====================================================================

revoke execute on function public.creator_kennzahlen() from anon;
revoke execute on function public.creator_verlauf(integer) from anon;

-- Der Vollständigkeit halber noch einmal PUBLIC, wie 0047/0048 es tun:
-- doppelt entzogen schadet nicht, einmal zu wenig schon.
revoke execute on function public.creator_kennzahlen() from public;
revoke execute on function public.creator_verlauf(integer) from public;
