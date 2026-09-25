-- =====================================================================
-- 0129 — anonymize_own_account() für niemanden mehr aufrufbar
-- =====================================================================
--
-- Eingespielt am 2026-09-25 (Supabase-Ledger: 0129_anonymize_own_account_grant_entziehen).
-- Lag bis dahin in ausstehend/ mit der Vorbedingung "das umgebaute
-- deleteAccount() läuft in Produktion". Geprüft am selben Tag: main ruft
-- ausschliesslich admin.rpc("anonymize_account") auf (lib/actions/auth.ts),
-- nirgends mehr anonymize_own_account. Eine Testlöschung hatte es noch nicht
-- gegeben (0 anonymisierte Profile) — der Zweck der Vorbedingung, dass die
-- laufende App die Funktion nicht mehr braucht, war damit direkt belegt.
-- Danach gemessen: authenticated/anon ohne EXECUTE, service_role behält
-- EXECUTE auf anonymize_account(uuid).

-- Der dritte und letzte Schritt aus 0076: Nach dem Entzug gibt es genau
-- einen Weg zur Anonymisierung — deleteAccount(), das die Identität per
-- Passwort-Neueingabe feststellt, danach das Stripe-Abo kündigt und die
-- Löschung abbricht, wenn das nicht sicher gelungen ist, und erst dann
-- anonymize_account(p_user_id) über den Admin-Client aufruft.
--
-- Der bisherige Direktweg über POST /rest/v1/rpc/anonymize_own_account
-- umging beides.
revoke execute on function public.anonymize_own_account() from authenticated;
revoke execute on function public.anonymize_own_account() from anon;
revoke execute on function public.anonymize_own_account() from public;

comment on function public.anonymize_own_account() is
  'Historische, parameterlose Huelle um anonymize_account(auth.uid()). Seit dem Grant-Entzug fuer niemanden ausser dem Owner aufrufbar — der einzige Weg zur Kontoloeschung fuehrt ueber deleteAccount() (Passwort-Neueingabe, Stripe-Kuendigung, dann anonymize_account ueber den Admin-Client). Die Funktion bleibt bestehen statt geloescht zu werden, damit ein Rueckweg per GRANT moeglich ist, falls sich eine unbekannte Abhaengigkeit zeigt.';

-- Achtung bei 0058: Das ist nicht eingespielt und erteilt den Grant an
-- authenticated erneut (0058:120). Wird es später nachgezogen, macht es
-- diesen Entzug rückgängig. Dann muss dieser revoke danach noch einmal
-- laufen — oder die Zeile in 0058 vorher entfernt werden.
