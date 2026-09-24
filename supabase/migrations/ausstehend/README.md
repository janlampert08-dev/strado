# Ausstehende Migrationen

Dateien hier sind **fertig, aber noch nicht einzuspielen**. Sie liegen
ausserhalb von `supabase/migrations/`, damit `supabase db push` sie nicht
mitnimmt — jede von ihnen hat eine Vorbedingung, die keine Migration
erfüllen kann.

Wer eine davon einspielt, verschiebt sie danach mit der nächsten freien
Nummer nach `supabase/migrations/`, damit sie im Ledger landet.

---

Zurzeit liegt hier nichts.

Zuletzt: `anonymize_own_account_grant_entziehen.sql`, eingespielt am
2026-09-25 und als `0129_anonymize_own_account_grant_entziehen.sql` in die
Reihe verschoben (Begründung im Kopf der Datei).
