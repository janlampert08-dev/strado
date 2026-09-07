-- =====================================================================
-- NICHT EINSPIELEN, bevor das umgebaute deleteAccount() im
-- Produktivbetrieb läuft und einmal erfolgreich gelöscht hat.
--
-- Siehe supabase/migrations/ausstehend/README.md für die vollständige
-- Reihenfolge und die Prüfschritte. Kurzfassung: Diese Datei entzieht
-- authenticated das Recht, anonymize_own_account() aufzurufen. Läuft sie
-- vor dem Deployment, ruft die laufende Anwendung eine Funktion auf, die
-- sie nicht mehr ausführen darf, und die Kontolöschung bricht für alle.
--
-- Beim Einspielen mit der nächsten freien Nummer nach
-- supabase/migrations/ verschieben, damit sie im Ledger landet.
-- =====================================================================

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
