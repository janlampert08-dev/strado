# Ausstehende Migrationen

Dateien hier sind **fertig, aber noch nicht einzuspielen**. Sie liegen
ausserhalb von `supabase/migrations/`, damit `supabase db push` sie nicht
mitnimmt — jede von ihnen hat eine Vorbedingung, die keine Migration
erfüllen kann.

Wer eine davon einspielt, verschiebt sie danach mit der nächsten freien
Nummer nach `supabase/migrations/`, damit sie im Ledger landet.

---

## `anonymize_own_account_grant_entziehen.sql`

**Vorbedingung: Das umgebaute `deleteAccount()` muss im Produktivbetrieb
laufen und einmal erfolgreich eine Kontolöschung durchgeführt haben.**

Warum das keine Migration mit erledigen kann: `deleteAccount()` ruft
heute `anonymize_own_account()` über den session-gebundenen Client auf.
Läuft der Entzug, bevor der neue Code ausgerollt ist, ruft die laufende
Anwendung eine Funktion auf, die sie nicht mehr ausführen darf — die
Kontolöschung bricht für alle Nutzer, bis das Deployment nachzieht.

Eine gemeinsame Migration mit `0076` löst das nicht: Sie wäre in der
Datenbank atomar und würde am Zeitpunkt des Anwendungs-Deployments nichts
ändern. Datenbank und Deployment sind zwei Achsen.

### Reihenfolge

1. `0076_anonymize_account_parametrisiert.sql` einspielen.
   Danach existiert `anonymize_account(uuid)` für `service_role`, und
   `anonymize_own_account()` ist eine Hülle darum. Der alte Aufrufer
   funktioniert unverändert weiter.
2. Diesen Branch deployen (Vercel). Danach ruft `deleteAccount()` die
   neue Funktion über den Admin-Client auf.
3. **Verifizieren**: ein Testkonto anlegen und über
   `/profil/einstellungen` löschen. Erwartung: Passwortabfrage,
   erfolgreiche Löschung, Profil anonymisiert, `subscriptions`-Zeile
   weg.
4. Erst dann diese Datei einspielen.

### Zusätzlich vorher prüfen

Der Grant wird an fünf Stellen vergeben (`0042:67`, `0045:203`,
`0047:47`, `0048:25`, `0058:120`). `0042` und `0058` sind nicht eingespielt
und werden es seit der Neubewertung vom 2026-09-08 auch nicht mehr: `0076`
enthält ihren gesamten Inhalt, und ein Nachziehen würde diesen Entzug
rückgängig machen sowie die Löschfunktion auf den Stand vor `0076`
zurückdrehen. Begründung in `../README.md`, Abschnitt „Neu bewertet: 0042 und
0058 sind Altlast, nicht Rückstand". Damit ist der Entzug hier dauerhaft, wenn
er einmal läuft — vorher war er es nur, solange niemand `0058` nachzog.

```sql
-- Läuft der Entzug ins Leere, weil eine spätere Migration ihn zurückholt?
-- Nach dem Einspielen prüfen:
select r.rolname, has_function_privilege(r.rolname, 'public.anonymize_own_account()', 'EXECUTE')
  from pg_roles r
 where r.rolname in ('anon', 'authenticated', 'service_role');
```

Erwartung danach: `anon` false, `authenticated` false, `service_role`
true.

### Rückweg

Falls die Kontolöschung nach dem Entzug doch bricht:

```sql
grant execute on function public.anonymize_own_account() to authenticated;
```

Das stellt den vorherigen Zustand her — inklusive der Umgehungslücke.
Also nur als Notausstieg, und mit einem Ticket für den zweiten Versuch.
