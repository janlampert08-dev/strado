# E-Mail-Vorlagen für Supabase Auth

Was hier liegt, ist **nicht angewendet**. Genau wie bei den Migrationen
nebenan gilt: grünes CI sagt nichts darüber aus, was im Projekt eingestellt
ist — die Vorlagen werden von Hand ins Supabase-Dashboard kopiert. Diese
Dateien sind die versionierte Fassung davon, damit eine Änderung im Diff
sichtbar wird statt nur in einem Formularfeld, das niemand sieht.

| Datei | Dashboard-Vorlage | Von der App benutzt für |
| --- | --- | --- |
| `bestaetigung.html` | Authentication → Emails → **Confirm signup** | Registrierung (`signUp`) und erneuter Versand (`sendeBestaetigungErneut`) |

## Einsetzen

1. Supabase-Dashboard → Authentication → Emails → Templates → *Confirm signup*.
2. Betreff: `Dein Strado-Code: {{ .Token }}`
   Der Code gehört in den Betreff, weil iOS und Android ihn dort aus der
   Push-Mitteilung heraus zum Einfügen anbieten — das ist der kürzeste Weg
   vom Postfach zurück ins Formular.
3. Den vollständigen Inhalt von `bestaetigung.html` in das Feld *Message
   body* kopieren.
4. Authentication → Sign In / Providers → Email → **Email OTP Expiration**
   muss auf `3600` (60 Minuten) stehen. Die Vorlage nennt diese Dauer im
   Text, und die App wiederholt sie auf der Bestätigungsseite
   (`BESTAETIGUNG_GUELTIG_SEKUNDEN` in `lib/bestaetigung.ts`). Drei Stellen,
   ein Wert — wer eine ändert, ändert alle drei.
5. **Confirm email** muss eingeschaltet bleiben. Ist es aus, liefert
   `signUp()` sofort eine Session, und die ganze Bestätigung entfällt
   stillschweigend (der Zweig dafür steht in `lib/actions/auth.ts`).

## Warum ein Code und kein Link

Die Standardvorlage von Supabase verschickt `{{ .ConfirmationURL }}`. Dieser
Link wird per PKCE eingelöst, und der dafür nötige Prüfwert liegt als Cookie
in **genau dem Browser**, aus dem die Registrierung kam. Wer die E-Mail auf
dem Handy öffnet, nachdem er sich am Rechner registriert hat, kommt damit
nicht durch — die Fehlermeldung dafür steht seit jeher in
`lib/authFehler.ts` und beschreibt den Normalfall, nicht den Ausnahmefall.

`{{ .Token }}` ist dieselbe Einmal-Nummer, nur ohne diese Bindung: sie wird
abgetippt, nicht angeklickt, und funktioniert deshalb über Gerätegrenzen
hinweg. Der Preis ist ein Formular mehr — das ist
`app/registrieren/bestaetigen`.

Seit dem 2026-09-16 gäbe es einen dritten Weg: `app/auth/callback/route.ts`
löst zusätzlich `?token_hash=…&type=…` per `verifyOtp()` ein, und der
braucht ebenfalls kein Cookie (`lib/otpTyp.ts`). Er ist für das Zurücksetzen
des Passworts gebaut, wo ein Link die einzige Form ist, die funktioniert.
Für die Registrierung bleibt es trotzdem beim Code, und der Grund steht in
`lib/otpTyp.ts` selbst: ein solcher Link ist für sich genommen der
Schlüssel. Beim Zurücksetzen ist das der bewusst bezahlte Preis dafür, dass
die Funktion überhaupt geht; hier ist er nicht nötig, weil der Code
denselben Dienst tut, ohne in einer weitergeleiteten E-Mail anklickbar zu
sein.

`app/auth/callback/route.ts` bleibt trotzdem stehen: die Vorlage zum
Zurücksetzen des Passworts verschickt weiterhin einen Link, und
Bestätigungsmails aus der Zeit vor dieser Änderung liegen noch in
Postfächern.

## Warum die Marke hier Text ist

Überall sonst zeichnet sich die Wortmarke aus `lib/marke.ts` (Kontur, damit
Satori und Canvas sie darstellen können). In einer E-Mail geht das nicht:
Gmail blockiert SVG vollständig, und ein PNG hinge an einem Fremd-Host, den
viele Clients erst nach einem Klick auf „Bilder anzeigen" laden. Die Marke
wäre dann in der Hälfte aller Postfächer schlicht nicht da. Deshalb steht in
der Vorlage gesetzter Text mit derselben Kleinschreibung und einer
angenäherten Laufweite — die einzige Stelle der App, an der die Marke nicht
aus `lib/marke.ts` kommt.

## Was beim Ändern zu prüfen ist

- Die Gestaltung steht **inline am Element**. Der `<style>`-Block im Kopf
  trägt nur den Dunkelmodus und die Schmalansicht; Gmail im Web wirft davon
  einen Teil weg, und die E-Mail muss auch ohne ihn vollständig lesbar sein.
- Kein externes Bild, kein Webfont, kein `<script>`.
- `{{ .Token }}` ist Go-Template-Syntax und muss genau so stehen bleiben.
- Zustellung: Solange kein eigener SMTP-Dienst eingerichtet ist, stellt
  Supabase Auth ausschliesslich an Adressen des Projekt-Teams zu (belegt am
  2026-09-16 an zwei Anfragen: Status 200, keine Mail). Eine Vorlage lässt
  sich also nur an eine solche Adresse wirklich prüfen.
