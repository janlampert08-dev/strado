# Datenschutzerklärung für Cornice

> ## ⚠️ Ungeprüfter Entwurf — keine Rechtsberatung
>
> Dieser Text ist ein **von einem KI-Assistenten erstellter, ungeprüfter
> Entwurf**. Er stellt **keine Rechtsberatung** dar und darf in dieser Form
> **nicht veröffentlicht** werden. Vor der Publikation muss er von einer
> **qualifizierten Schweizer Anwältin oder einem qualifizierten Schweizer
> Anwalt** geprüft und freigegeben werden — insbesondere die Abschnitte zu
> Rechtsgrundlagen (Abschnitt 5), zur Bekanntgabe ins Ausland (Abschnitt 8)
> und zur Aufbewahrung nach einer Kontolöschung (Abschnitt 9), weil dort
> Aussagen stehen, die sich mit dem tatsächlichen Verhalten des Systems decken
> müssen.
>
> Der Text beschreibt den Stand der Datenbearbeitung, wie er sich aus dem
> Quellcode dieses Repositories ergibt (Stand des Entwurfs: 2026-09-06).
> **Ändert sich der Code, muss dieser Text mitgeändert werden.** Am Ende
> stehen ausserdem Punkte, die vor der Veröffentlichung fachlich geklärt
> werden müssen.
>
> Alle Angaben in doppelten eckigen Klammern (`[[…]]`) sind **Platzhalter**.
> Sie wurden bewusst **nicht** erfunden und müssen vor der Veröffentlichung
> durch die echten Werte ersetzt werden. Eine vollständige Liste steht am
> Ende dieses Dokuments.

---

**Stand: [[STAND_DATUM]]**

## 1. Verantwortliche Stelle

Verantwortlich für die Bearbeitung von Personendaten im Zusammenhang mit
Cornice ist:

[[FIRMENNAME]] [[RECHTSFORM]]
[[STRASSE_NR]], [[PLZ_ORT]], Schweiz
E-Mail: [[EMAIL_DATENSCHUTZ]]

Für alle Fragen zum Datenschutz, für Auskunftsbegehren und für die Ausübung
der Rechte nach Abschnitt 11 genügt eine formlose Nachricht an diese Adresse.

## 2. Geltungsbereich und anwendbares Recht

**2.1** Diese Erklärung gilt für die Website und Webanwendung Cornice unter
`https://[[DOMAIN]]` sowie für alle damit verbundenen Bearbeitungen.

**2.2** Massgebend ist das **Schweizer Bundesgesetz über den Datenschutz
(DSG, revidiert)** samt Verordnung (VDSG). Soweit auf einzelne Nutzende die
europäische Datenschutz-Grundverordnung (DSGVO) anwendbar ist, gelten die
dortigen Bestimmungen ergänzend; die Rechtsgrundlagen sind in Abschnitt 5
zugeordnet.

**2.3** Wir bearbeiten Personendaten nur, soweit dies für den Betrieb von
Cornice nötig ist. Wir **verkaufen keine Personendaten** und geben sie nicht
zu Werbezwecken an Dritte weiter.

## 3. Welche Daten wir bearbeiten

### 3.1 Konto- und Anmeldedaten

Bei der Registrierung werden **E-Mail-Adresse**, ein **Passwort** und ein frei
gewählter **Anzeigename** erfasst. Das Passwort wird ausschliesslich als
kryptografischer Hash beim Authentifizierungsdienst gespeichert; wir haben zu
keinem Zeitpunkt Zugriff auf das Klartextpasswort. Zusätzlich fallen der
Zeitpunkt der Registrierung, der Bestätigungsstatus der E-Mail-Adresse und
Sitzungsinformationen an.

Die E-Mail-Adresse wird für die Registrierungsbestätigung, das Zurücksetzen des
Passworts und für betriebsnotwendige Mitteilungen verwendet — beim Premium-Abo
zusätzlich für Zahlungs- und Vertragsmitteilungen.

### 3.2 Profildaten

Zum Profil gehören: Anzeigename, optionales **Profilbild**, die Einstellung des
**Privatzonen-Radius** (Abschnitt 3.4), sowie mehrere unabhängige
**Sichtbarkeits-Schalter**, mit denen selbst bestimmt wird, was auf dem
öffentlichen Profil erscheint (Profilbild, Fahrzeuge, Anzahl Pässe,
Höhenmeter, Distanz, Follower-Liste, Premium-Abzeichen). Beim Premium-Abo
kommt eine Kunden-Kennung des Zahlungsdienstleisters hinzu (Abschnitt 3.9).

> **Wichtig zu den Standardeinstellungen:** Bei neu angelegten Konten sind
> diese Profil-Schalter **standardmässig ausgeschaltet** — Profilbild,
> Fahrzeuge, Anzahl Pässe, Höhenmeter, Distanz und Follower-Liste erscheinen
> also erst auf dem öffentlichen Profil, wenn sie in den Einstellungen
> eingeschaltet werden. Dasselbe gilt für das Premium-Abzeichen. Die
> Sichtbarkeit **einzelner Fahrten** ist davon unabhängig und ebenfalls
> standardmässig **aus** (Abschnitt 3.4).

### 3.3 Fahrzeugdaten

Optional angelegte Fahrzeuge mit Typ (Auto/Motorrad), Marke, Modell,
Getriebeart und Baujahr. Fahrzeuge sind grundsätzlich nur für die Eigentümerin
oder den Eigentümer sichtbar. Erst wenn der Schalter „Fahrzeuge zeigen"
aktiviert wird, erscheinen Typ, Marke und Modell neben veröffentlichten
Fahrten.

### 3.4 Fahrten und GPS-Standortdaten

Dies ist die **datenschutzrechtlich heikelste Kategorie**, weil aus
Bewegungsdaten Rückschlüsse auf Wohnort, Arbeitsort und Tagesabläufe möglich
sind. Wir behandeln sie entsprechend zurückhaltend.

**Was aufgezeichnet wird.** Wird eine Fahrt gestartet, greift die Anwendung
über die Standortfunktion des Browsers (Geolocation API) auf die
Positionsdaten des Geräts zu — **nur nach ausdrücklicher Freigabe im Browser
und nur während einer laufenden Aufzeichnung**. Daraus entsteht ein
**GPS-Track** (Folge von Koordinaten) sowie daraus abgeleitete Werte:
zurückgelegte Distanz, Gesamtdauer, reine Bewegtzeit, Höhenmeter, Höhenprofil
und — bei Streckenfahrten — der Deckungsgrad gegenüber der offiziellen
Streckengeometrie. Diese Werte werden serverseitig aus dem übermittelten Track
berechnet, nicht vom Gerät übernommen.

Dazu kommen: Datum, gewähltes Fahrzeug, eine optionale private **Notiz** (max.
280 Zeichen), bei freien Fahrten ein selbst gewählter **Titel** sowie ein
per Reverse-Geocoding ermittelter **Ortsbezug** (Startort und Region).

**Sichtbarkeit.** Fahrten sind **standardmässig privat**. Eine Fahrt wird erst
öffentlich, wenn dies pro Fahrt aktiv gewählt wird; die Einstellung ist
jederzeit umkehrbar. Der **vollständige GPS-Track ist ausschliesslich für die
eigene Person sichtbar** — die Zugriffsregeln der Datenbank
(Row Level Security) lassen keinen anderen Zugriff zu.

**Privatzone.** Von einer öffentlich geteilten Fahrt wird nicht der
vollständige Track veröffentlicht, sondern eine gekappte Fassung: Anfang und
Ende werden innerhalb eines einstellbaren Radius **abgeschnitten**, damit
Wohn- oder Arbeitsadresse nicht ableitbar sind. Der Radius beträgt
standardmässig **200 Meter** und lässt sich im Profil ändern; der Wert `0`
schaltet die Kappung ab. Wird der Radius nachträglich verkleinert oder
vergrössert, werden **bereits geteilte Fahrten neu zugeschnitten**. Bleibt
nach dem Zuschnitt zu wenig übrig, wird gar keine Karte veröffentlicht.

**Zwischenspeicher auf dem Gerät.** Während einer laufenden Aufzeichnung wird
der Zwischenstand (bisheriger Trail, Distanz, Startzeit) **lokal im Browser**
gespeichert, damit eine unterbrochene Aufzeichnung — geschlossener Tab,
Absturz, Bildschirmsperre — fortgesetzt werden kann. Dieser Zwischenspeicher
liegt auf dem Gerät und wird nicht an uns übermittelt, solange die Fahrt nicht
gespeichert wird. Auch **nicht angemeldete Besuchende** können eine freie Fahrt
aufzeichnen; die Aufzeichnung bleibt dann bis zu einer allfälligen Anmeldung
ausschliesslich lokal.

**Standort ausserhalb der Aufzeichnung.** In der Streckensuche und bei der
Streckenwahl kann der aktuelle Standort abgefragt werden, um Strecken in der
Nähe anzuzeigen. Dieser Standort wird **nur im Browser verwendet und nicht
gespeichert**.

### 3.5 Fotos

Zu jeder Fahrt können Fotos hochgeladen werden; ausserdem kann ein Profilbild
gesetzt werden.

**Sichtbarkeit von Fahrt-Fotos.** Fahrt-Fotos liegen in einem **nicht
öffentlich lesbaren Speicher**. Sie werden nur über zeitlich begrenzt gültige
Links ausgeliefert, die der Server erzeugt, nachdem er geprüft hat, dass die
zugehörige Fahrt öffentlich ist oder dass die abrufende Person die Fahrt
selbst gefahren ist. Ein weitergegebener Link funktioniert deshalb nicht
dauerhaft, und ein Foto einer wieder auf privat gestellten Fahrt ist nicht
mehr abrufbar.

> **Hinweis zu Profilbildern:** Profilbilder liegen weiterhin in einem
> **öffentlich lesbaren Speicher**. Wer die vollständige Adresse einer solchen
> Datei kennt, kann sie abrufen — auch dann, wenn der Schalter „Profilbild
> zeigen" ausgeschaltet ist. Der Schalter steuert die Anzeige im Profil, nicht
> die Erreichbarkeit der Datei.

**Metadaten in hochgeladenen Bildern.** Bevor ein Bild gespeichert wird,
werden seine **Metadaten serverseitig entfernt** — insbesondere
Aufnahmeort (GPS) und Aufnahmezeitpunkt aus dem EXIF-Block. Das gilt für
Fahrt-Fotos und für Profilbilder. Erhalten bleibt einzig die Angabe zur
Bildausrichtung, damit hochkant aufgenommene Fotos nicht gedreht erscheinen;
sie enthält keine personenbezogene Information. Die Bilddaten selbst werden
dabei nicht neu berechnet, die Bildqualität ändert sich also nicht.

### 3.6 Community-Funktionen

- **Bewertungen** zu Strecken (Kommentartext) — öffentlich sichtbar zusammen
  mit dem Anzeigenamen.
- **Kudos** auf öffentliche Fahrten anderer.
- **Folgen** anderer Nutzender (Follows). Ob die eigene Follower-Liste
  öffentlich ist, steuert ein eigener Schalter.
- **Favoriten** (gemerkte Strecken) — nur für die eigene Person sichtbar.
- **Bestenlisten und Statistiken**, die aus öffentlich gestellten Fahrten
  berechnet werden.
- **Feed und Aktivitätsliste**, in denen Fahrten und erhaltene Kudos
  erscheinen.

### 3.7 Streckenvorschläge

Wird eine Strecke vorgeschlagen, speichern wir die Streckengeometrie, Name,
Region, Start- und Zielort, Charaktertext sowie die Zuordnung zur
vorschlagenden Person. Vorschläge durchlaufen eine Moderation.
**Abgelehnte Vorschläge werden drei Tage nach der Ablehnung automatisch
gelöscht**; vorher können sie selbst gelöscht werden.

### 3.8 Meldungen und Moderation

Wird ein Inhalt (Strecke, Bewertung oder Fahrt) gemeldet, speichern wir die
meldende Person, den gewählten Grund, einen optionalen Kommentar, den
Bearbeitungsstatus sowie die bearbeitende Moderationsperson und den Zeitpunkt.
Meldungen sind für die gemeldete Person nicht einsehbar.

### 3.9 Zahlungs- und Abodaten (nur bei Premium)

Die Zahlungsabwicklung läuft vollständig über **Stripe**. **Karten- und
Kontodaten erreichen unsere Systeme nicht.**

In unserer Datenbank speichern wir am Profil die **Kunden-Kennung von Stripe**
sowie eine gespiegelte Fassung des Abo-Zustands mit den folgenden Angaben:

| Angabe | Zweck |
| --- | --- |
| Kennung des Abos bei Stripe | ordnet die Zeile dem Abo zu, aus dem sie stammt |
| Kennung des gewählten Preises | unterscheidet Monats-, Jahres- und Gründerpreis-Abo |
| Status des Abos | entscheidet über die Premium-Berechtigung |
| Ende der laufenden Abrechnungsperiode | Anzeige „Premium bis …" und Erkennung ausgebliebener Meldungen |
| Kennzeichen „zum Periodenende gekündigt" | Anzeige des Kündigungsstands |
| Ende einer laufenden Kulanzfrist und die auslösende Rechnungsnummer | hält Premium nach einer fehlgeschlagenen Zahlung befristet aufrecht und verhindert, dass Wiederholungsversuche derselben Rechnung die Frist verlängern |
| Zeitpunkt des letzten Abrufs bei Stripe und der letzten Änderung | Nachvollziehbarkeit und Erkennung veralteter Meldungen |

An Stripe übermitteln wir die **E-Mail-Adresse** und die interne
Benutzer-Kennung (als Metadatum zur Zuordnung). Stripe erhebt darüber hinaus
selbst die Zahlungsmitteldaten, Rechnungs- und Transaktionsdaten sowie
technische Daten des Zahlungsvorgangs.

Zur Absicherung gegen doppelt zugestellte Zahlungsereignisse speichern wir zu
jedem von Stripe gemeldeten Ereignis dessen **Kennung**, seinen **Typ**, den
**Bearbeitungsstand** sowie den **Eingangs- und Abschlusszeitpunkt**. Diese
Angaben enthalten keine Zahlungsdaten; sie dienen ausschliesslich dazu, ein
mehrfach zugestelltes Ereignis nur einmal wirken zu lassen.

### 3.10 Technische Daten

**Server- und Plattformprotokolle.** Beim Aufruf der Website fallen bei den
Hosting-Anbietern (Abschnitt 7) technisch bedingt Protokolldaten an,
namentlich IP-Adresse, Zeitpunkt, aufgerufene Adresse, Statuscode,
Referrer und Angaben zu Browser und Betriebssystem.

**IP-Adresse zur Missbrauchsabwehr.** Für Anmeldung, Registrierung und
Passwort-Zurücksetzen sowie für die öffentlichen Schnittstellen begrenzen wir
die Anzahl Versuche pro IP-Adresse. Die dafür nötigen Angaben werden
**ausschliesslich flüchtig im Arbeitsspeicher der jeweiligen Serverinstanz**
gehalten, für ein Zeitfenster von wenigen Minuten, und **nicht in der
Datenbank gespeichert**.

**Cookies und lokale Speicher.** Cornice setzt **keine Werbe- oder
Trackingcookies**. Verwendet werden:

| Zweck | Technik | Bemerkung |
| --- | --- | --- |
| Anmeldung / Sitzung | Cookies des Authentifizierungsdienstes | technisch notwendig; werden bei jedem Seitenaufruf erneuert |
| Farbschema (hell/dunkel) | `localStorage` | reine Anzeigepräferenz |
| Zwischenstand einer laufenden Aufzeichnung | `localStorage` | siehe Abschnitt 3.4 |
| Offline gespeicherte Strecken | `IndexedDB` (`cornice-offline`) | rein lokal, wird nicht an uns übermittelt |
| Offline-Seite und statische Dateien | Service-Worker-Cache | rein lokal |

**Reichweitenmessung.** Wir setzen die Reichweitenmessung unseres
Hosting-Anbieters ein (**Vercel Web Analytics**). Sie erfasst aggregierte
Nutzungszahlen wie Seitenaufrufe, Herkunftsseite, ungefähre geografische
Herkunft, Gerätetyp und Browser. Nach Angaben des Anbieters arbeitet sie
**ohne Cookies** und ohne dauerhafte Kennung einzelner Personen; zur
Unterscheidung wiederkehrender Aufrufe innerhalb eines Tages wird ein
nicht rückrechenbarer Hashwert gebildet. Es werden keine Profile über
mehrere Websites hinweg gebildet.

## 4. Zu welchen Zwecken wir Daten bearbeiten

- Bereitstellung und Betrieb der Plattform, Anmeldung und Kontoverwaltung
- Aufzeichnung, Berechnung und Darstellung von Fahrten und Statistiken
- Community-Funktionen: Feed, Bestenlisten, Kudos, Bewertungen, Folgen
- Kuratierung und Moderation von Strecken und Inhalten
- Abwicklung des Premium-Abos: Vertragsschluss, Zahlung, Rechnungsstellung,
  Kündigung, Rückerstattung
- Kommunikation: betriebsnotwendige Mitteilungen, Support, Antworten auf
  Anfragen
- Sicherheit und Missbrauchsabwehr: Begrenzung von Anmeldeversuchen und
  Massenregistrierungen, Erkennung und Verfolgung von Verstössen
- Fehlersuche, Betriebsstabilität und Weiterentwicklung
- Erfüllung gesetzlicher Pflichten, insbesondere Aufbewahrungspflichten für
  Geschäfts- und Buchhaltungsunterlagen

## 5. Rechtsgrundlagen

**5.1 Schweizer Recht.** Nach dem DSG dürfen private Personen Personendaten
bearbeiten, solange die Persönlichkeit der betroffenen Personen nicht
widerrechtlich verletzt wird. Wo eine Rechtfertigung nötig ist, stützen wir uns
auf Art. 31 DSG: **Vertragserfüllung** (Konto, Fahrten, Abo),
**überwiegendes privates Interesse** (Sicherheit, Missbrauchsabwehr,
Reichweitenmessung, Weiterentwicklung), **Einwilligung** (Standortzugriff,
Veröffentlichen einzelner Fahrten, optionale Profilangaben) und **gesetzliche
Pflicht** (Aufbewahrung).

**5.2 DSGVO, soweit anwendbar.** Für Nutzende, auf die die DSGVO anwendbar
ist, gilt zusätzlich:

| Bearbeitung | Rechtsgrundlage DSGVO |
| --- | --- |
| Konto, Fahrten, Abo, Zahlungsabwicklung | Art. 6 Abs. 1 lit. b (Vertrag) |
| Standortzugriff, Veröffentlichen einzelner Fahrten, Profilbild, Premium-Abzeichen | Art. 6 Abs. 1 lit. a (Einwilligung) |
| Voreingestellt sichtbare Profilangaben (Abschnitt 6) | Art. 6 Abs. 1 lit. b und f — siehe offenen Punkt 12 |
| Sicherheit, Missbrauchsabwehr, Reichweitenmessung, Moderation | Art. 6 Abs. 1 lit. f (berechtigtes Interesse) |
| Aufbewahrung von Rechnungsunterlagen | Art. 6 Abs. 1 lit. c (rechtliche Verpflichtung) |

Eine Einwilligung kann jederzeit mit Wirkung für die Zukunft widerrufen
werden — beim Standortzugriff über die Browsereinstellungen, bei der
Sichtbarkeit von Fahrten und Profilangaben über die entsprechenden Schalter in
der Anwendung.

## 6. Sichtbarkeit gegenüber anderen Nutzenden

Cornice ist zu einem Teil eine öffentliche Plattform. Damit klar ist, was
andere sehen können:

**Immer öffentlich sichtbar (sofern gesetzt):** Anzeigename;
Bewertungstexte; Streckenvorschläge nach ihrer Freigabe.

**Nur nach ausdrücklicher Freigabe sichtbar (Standard: aus):** einzelne
Fahrten — mit Datum, Strecke bzw. Titel, Distanz, Dauer, Höhenmeter, Fotos und
Notiz sowie dem an den Enden gekappten Track; ausserdem das Premium-Abzeichen.

**Erst nach eigenem Einschalten sichtbar (Standard: aus):** Profilbild;
Fahrzeuge; Anzahl gefahrener Pässe; gesammelte Höhenmeter; gefahrene Distanz;
Follower-Liste. Diese sechs Schalter sind bei neuen Konten voreingestellt
**aus** und lassen sich in den Profileinstellungen einzeln einschalten.

**Nie für andere sichtbar:** der vollständige, ungekappte GPS-Track;
Fahrten, die nicht öffentlich gestellt sind; Notizen privater Fahrten;
Favoriten; E-Mail-Adresse; Zahlungsangaben; abgegebene Meldungen.

> **Zu bedenken:** Sobald eine Fahrt öffentlich gestellt wird, wird auch ihre
> Notiz öffentlich. Wird eine Fahrt später wieder auf privat gestellt,
> verschwindet sie aus Feed und Bestenlisten — bereits von Dritten angefertigte
> Kopien (Screenshots, geteilte Bilder) können wir nicht zurückholen.

## 7. Empfänger und Auftragsbearbeiter

Wir setzen die folgenden Dienstleister ein. Soweit sie Personendaten in
unserem Auftrag bearbeiten, sind sie vertraglich verpflichtet, diese nur
weisungsgemäss und mit angemessenen Sicherheitsmassnahmen zu bearbeiten.

| Dienst | Rolle | Übermittelte Daten |
| --- | --- | --- |
| **Supabase** (Supabase Inc., USA; Datenbank-Region: [[SUPABASE_REGION]]) | Datenbank, Authentifizierung, Dateispeicher, Versand der Konto-E-Mails | sämtliche Konto-, Profil-, Fahrten-, Track-, Foto- und Community-Daten |
| **Vercel** (Vercel Inc., USA; Ausführungsregion: [[VERCEL_REGION]]) | Hosting der Anwendung, Reichweitenmessung | technische Verbindungsdaten inkl. IP-Adresse, alle über die Anwendung laufenden Inhalte, aggregierte Nutzungszahlen |
| **Stripe** (Stripe Payments Europe Ltd., Irland, sowie verbundene Gesellschaften) | Zahlungsabwicklung, Abo-Verwaltung, Kundenportal | E-Mail-Adresse, interne Benutzer-Kennung, Zahlungsmittel- und Rechnungsdaten (direkt bei Stripe erhoben) |
| **Mapbox** (Mapbox Inc., USA) | Kartendarstellung, Routenberechnung, Ortsnamen (Geocoding), Verkehrslage | IP-Adresse und technische Daten des Browsers beim Laden von Karten; Koordinaten der angezeigten bzw. geplanten Strecke |
| **Open-Meteo** (`api.open-meteo.com`) | aktuelles Wetter am Streckenstart | Koordinaten des Streckenstartpunkts. Die Abfrage erfolgt von unserem Server aus; die IP-Adresse der Nutzenden wird dabei nicht übermittelt |
| **swisstopo / geo.admin.ch** (Bundesamt für Landestopografie, Schweiz) | Höhenprofile entlang von Strecken und Fahrten | Geometrie der jeweiligen Strecke bzw. Fahrt. Die Abfrage erfolgt von unserem Server aus; die IP-Adresse der Nutzenden wird dabei nicht übermittelt |

**Karten und Verkehrsdaten laufen direkt aus dem Browser** zu Mapbox — dabei
erfährt Mapbox die IP-Adresse und welche Strecke betrachtet wird. Wetter- und
Höhendaten holen wir dagegen serverseitig, dort erfährt der Dienst nur die
abgefragten Koordinaten, nicht wer sie abfragt.

**Externer Link zu Google Maps.** Auf Streckenseiten steht ein Link, der die
Strecke in Google Maps öffnet. Wir übermitteln dabei von uns aus keine Daten;
sobald der Link angeklickt wird, gelten die Datenschutzbestimmungen von
Google, und Google erhält die üblichen Verbindungsdaten sowie die in der
Adresse enthaltenen Koordinaten.

**Behörden und Rechtsverfolgung.** Wir geben Daten an Behörden oder Gerichte
weiter, wenn wir dazu gesetzlich verpflichtet sind oder wenn es zur
Durchsetzung unserer Rechte nötig ist.

> **Prüfpunkt für die Fertigstellung:** Die in der Tabelle genannten
> Gesellschaftsbezeichnungen und Sitzstaaten sind vor der Veröffentlichung
> anhand der tatsächlich abgeschlossenen Verträge zu verifizieren — massgebend
> ist die jeweils vertragschliessende Gesellschaft, nicht der Markenname. Sie
> wurden hier nach allgemeinem Kenntnisstand eingesetzt und nicht aus dem
> Repository belegt.

## 8. Bekanntgabe ins Ausland

Ein Teil der eingesetzten Dienste hat seinen Sitz ausserhalb der Schweiz,
namentlich in den **Vereinigten Staaten** und im **EWR**. Damit werden
Personendaten ins Ausland bekanntgegeben.

Für Staaten mit einem vom Bundesrat anerkannten angemessenen Datenschutz
(darunter die EU- und EWR-Staaten) ist keine zusätzliche Massnahme nötig. Für
Bekanntgaben in Staaten ohne anerkanntes angemessenes Schutzniveau stützen wir
uns auf geeignete Garantien im Sinne von Art. 16 Abs. 2 DSG, insbesondere auf
**Standardvertragsklauseln** und — soweit der jeweilige Anbieter zertifiziert
ist — auf das **Swiss-U.S. Data Privacy Framework**.

Trotz dieser Garantien lässt sich nicht ausschliessen, dass Behörden im
Empfängerstaat auf Daten zugreifen.

> **Prüfpunkt für die anwaltliche Durchsicht:** Für jeden Anbieter ist vor der
> Veröffentlichung einzeln zu belegen, worauf sich die Bekanntgabe stützt
> (Zertifizierung, Standardvertragsklauseln, Speicherregion). Die
> Datenbank-Region von Supabase und die Ausführungsregion bei Vercel
> bestimmen mit, ob überhaupt eine Auslandbekanntgabe der Kerndaten vorliegt.

## 9. Aufbewahrung und Löschung

**9.1 Grundsatz.** Wir bewahren Personendaten so lange auf, wie es für den
jeweiligen Zweck nötig ist oder wie gesetzliche Aufbewahrungsfristen es
verlangen.

**9.2 Selbstbedienung.** Vieles lässt sich jederzeit selbst löschen oder
verbergen: einzelne Fahrten löschen, einzelne Fotos entfernen, Notizen ändern,
die Sichtbarkeit einer Fahrt umstellen, Fahrzeuge löschen, eigene abgelehnte
Streckenvorschläge löschen, Profilangaben und Sichtbarkeitsschalter ändern,
den Privatzonen-Radius anpassen (was bereits geteilte Fahrten neu zuschneidet).

**9.3 Feste Fristen.**

| Daten | Aufbewahrung |
| --- | --- |
| Abgelehnte Streckenvorschläge | automatische Löschung 3 Tage nach der Ablehnung |
| IP-Adressen zur Missbrauchsabwehr | flüchtig im Arbeitsspeicher, wenige Minuten, keine Datenbankablage |
| Konto-, Profil-, Fahrten- und Community-Daten | bis zur Löschung durch die Nutzenden bzw. bis zur Kontolöschung — **mit den Ausnahmen aus Ziff. 9.4**: veröffentlichte Streckenfahrten, Bewertungen, Kudos, Follows, Meldungen, Fotos zu erhalten bleibenden Fahrten und ein technischer Löschvermerk bleiben ohne Namensbezug bestehen |
| Abo-Zustand (Abschnitt 3.9) | bis zum Ende des Abos; bei der Kontolöschung wird die Zeile entfernt |
| Rechnungs- und Zahlungsunterlagen | gesetzliche Aufbewahrungsfrist, in der Regel 10 Jahre (Art. 958f OR) — überwiegend bei Stripe |
| Protokolldaten der Hosting-Anbieter | nach deren Aufbewahrungsfristen |

**9.4 Kontolöschung.** Die Kontolöschung erfolgt in den Kontoeinstellungen und
verlangt zur Sicherheit eine erneute Eingabe des Passworts. Sie ist
**unumkehrbar**. Dabei geschieht Folgendes:

*Entfernt oder unbrauchbar gemacht wird:*

- Anzeigename und Profilbild werden entfernt (das Profil erscheint fortan
  anonym),
- die Zuordnung zum Zahlungsdienstleister wird entfernt,
- sämtliche Sichtbarkeits- und Statusschalter werden abgeschaltet,
- **alle GPS-Tracks aller Fahrten werden gelöscht** — sowohl die vollständigen
  als auch die gekappten öffentlichen Fassungen,
- **freie Fahrten werden auf privat gestellt**,
- alle Fahrzeuge werden gelöscht,
- die E-Mail-Adresse wird im Authentifizierungsdienst durch eine synthetische,
  nicht zustellbare Adresse ersetzt und das Passwort durch einen Zufallswert;
  eine Anmeldung ist danach nicht mehr möglich, und die ursprüngliche Adresse
  wird für eine spätere Neuregistrierung wieder frei.

*Bewusst erhalten bleibt:*

- **veröffentlichte Streckenfahrten** — ohne Namensbezug, ohne Track —, damit
  Bestenlisten und Streckenstatistiken nicht rückwirkend verfälscht werden,
- abgegebene **Bewertungen**, **Kudos**, **Follows** und **Meldungen**, jeweils
  ohne sichtbaren Namensbezug,
- **bereits hochgeladene Fotos**, die zu erhalten bleibenden öffentlichen
  Fahrten gehören,
- ein technischer Datensatz mit einer nicht sprechenden Kennung und dem
  Zeitpunkt der Löschung, damit ein geleertes Konto von einem neuen Konto
  unterscheidbar bleibt.

**9.5 Weitergehende Löschung.** Wer über diese Anonymisierung hinaus die
vollständige Löschung einzelner Inhalte wünscht — namentlich von Fotos,
Bewertungen oder erhalten gebliebenen öffentlichen Fahrten —, kann dies
jederzeit per Nachricht an [[EMAIL_DATENSCHUTZ]] verlangen. Wir setzen ein
solches Begehren im Rahmen der gesetzlichen Vorgaben um; **es empfiehlt sich,
Inhalte vor der Kontolöschung selbst zu löschen**, da eine nachträgliche
Zuordnung ohne Konto aufwendiger ist.

**9.6 Laufendes Abo bei der Kontolöschung.** Wird das Konto gelöscht, während
ein Premium-Abo läuft, kündigen wir das Abo beim Zahlungsdienstleister, bevor
wir das Profil anonymisieren. Gelingt diese Kündigung nicht, **brechen wir die
Kontolöschung ab** und melden das zurück — ein gelöschtes Konto, dessen
Abrechnung unbemerkt weiterläuft, wäre der schlechtere Ausgang. In diesem Fall
kann die Löschung später erneut versucht oder das Abo zuvor selbst über das
Kundenportal gekündigt werden (siehe AGB Ziff. 6.4).

> **Prüfpunkt für die Fertigstellung:** Dieses Verhalten ist mit Phase 1
> umgesetzt (`lib/actions/auth.ts`, Befund 3.5 in `docs/premium-plan.md`).
> Vor der Veröffentlichung ist zu bestätigen, dass die zugehörige Migration
> eingespielt und der Ablauf im Betrieb tatsächlich so beobachtet wurde —
> eine Datenschutzerklärung, die ein Verhalten beschreibt, das die
> Produktionsumgebung noch nicht zeigt, ist genauso falsch wie eine, die
> einen bestehenden Mangel verschweigt.

## 10. Datensicherheit

Wir treffen angemessene technische und organisatorische Massnahmen, unter
anderem:

- **Verschlüsselte Übertragung** (TLS/HTTPS) für sämtliche Verbindungen.
- **Zeilenbasierte Zugriffsregeln in der Datenbank** (Row Level Security) als
  primäre Zugriffsschranke: Jede Abfrage läuft mit den Rechten der angemeldeten
  Person; fremde Fahrten, Tracks, Fahrzeuge und Favoriten sind technisch nicht
  erreichbar, nicht nur ausgeblendet.
- **Eingeschränkte Sichten** für alles Öffentliche: Feed, Bestenlisten und
  öffentliche Profile lesen aus separaten Sichten, die nur die freigegebenen
  Felder enthalten.
- **Serverseitige Erzwingung** aller Sichtbarkeits- und Berechtigungsregeln —
  Einstellungen im Browser sind Anzeigehilfen, keine Schranken.
- **Passwörter** werden ausschliesslich gehasht beim Authentifizierungsdienst
  gespeichert.
- **Zugriffsschlüssel mit erweiterten Rechten** werden ausschliesslich
  serverseitig verwendet und gelangen nie in den Browser.
- **Signaturprüfung** aller vom Zahlungsdienstleister eingehenden Meldungen.
- **Begrenzung von Anmeldeversuchen, Registrierungen und Passwortanfragen**.
- **Privatzonen-Kappung** aller öffentlich geteilten Tracks (Abschnitt 3.4).

Eine absolute Sicherheit kann bei der Datenübertragung im Internet niemand
gewährleisten.

## 11. Ihre Rechte

Im Rahmen des anwendbaren Rechts haben Sie insbesondere folgende Rechte:

- **Auskunft** darüber, ob und welche Personendaten wir über Sie bearbeiten
  (Art. 25 DSG).
- **Berichtigung** unrichtiger Daten (Art. 32 DSG). Vieles lässt sich direkt in
  der Anwendung ändern.
- **Löschung oder Vernichtung** Ihrer Daten, soweit keine gesetzliche
  Aufbewahrungspflicht und kein überwiegendes Interesse entgegensteht
  (Abschnitt 9).
- **Widerspruch** gegen eine bestimmte Bearbeitung sowie **Widerruf einer
  erteilten Einwilligung** mit Wirkung für die Zukunft.
- **Datenherausgabe und -übertragung** in einem gängigen elektronischen Format
  (Art. 28 DSG; für die DSGVO: Datenübertragbarkeit nach Art. 20). Eigene
  Fahrten lassen sich zusätzlich jederzeit selbst als **GPX-Datei** exportieren.
- **Einschränkung der Bearbeitung**, soweit die DSGVO anwendbar ist.

Zur Ausübung genügt eine Nachricht an [[EMAIL_DATENSCHUTZ]]. Wir dürfen zur
Identifikation zusätzliche Angaben verlangen — insbesondere, um zu verhindern,
dass jemand unter falschem Namen Auskunft über fremde Daten erhält. Die
Auskunft ist grundsätzlich kostenlos.

**Aufsichtsbehörde.** Sie können sich jederzeit beim **Eidgenössischen
Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB)**, Feldeggweg 1,
3003 Bern, beschweren. Soweit die DSGVO anwendbar ist, steht Ihnen zusätzlich
das Beschwerderecht bei der Aufsichtsbehörde Ihres Wohnsitzstaates zu.

## 12. Automatisierte Entscheidungen und Profiling

Es findet **keine automatisierte Einzelentscheidung** statt, die für Sie
rechtliche Wirkung entfaltet oder Sie erheblich beeinträchtigt.

Wir weisen jedoch ausdrücklich darauf hin: Die Zusammenführung mehrerer
aufgezeichneter Fahrten zu Statistiken, Bestenlisten und Jahresauswertungen
kann eine automatisierte Auswertung persönlicher Aspekte darstellen. Da es
sich dabei um Bewegungsdaten handelt, gehen wir mit diesen Auswertungen
zurückhaltend um: Sie beruhen ausschliesslich auf den eigenen Fahrten, dienen
der Darstellung gegenüber der betroffenen Person selbst und werden nicht zur
Bewertung von Kreditwürdigkeit, Versicherbarkeit, Fahrverhalten oder
Ähnlichem verwendet und auch nicht an Dritte weitergegeben.

## 13. Minderjährige

Ein Konto darf nur eröffnen, wer handlungsfähig ist; Minderjährige benötigen
die Zustimmung ihrer gesetzlichen Vertretung (siehe AGB Ziff. 2.3). Wir prüfen
das Alter technisch nicht. Erfahren wir, dass Daten einer minderjährigen
Person ohne die nötige Zustimmung bearbeitet werden, löschen wir diese.

## 14. Änderungen dieser Datenschutzerklärung

Wir können diese Datenschutzerklärung anpassen, wenn sich die
Datenbearbeitung, die eingesetzten Dienste oder die Rechtslage ändern. Es gilt
jeweils die auf `https://[[DOMAIN]]/datenschutz` veröffentlichte Fassung. Bei
wesentlichen Änderungen informieren wir zusätzlich in der Anwendung oder per
E-Mail.

---

## Verwendete Platzhalter

| Platzhalter | Bedeutung | Kommt vor in |
| --- | --- | --- |
| `[[FIRMENNAME]]` | Firmenname der verantwortlichen Stelle | Abschnitt 1 |
| `[[RECHTSFORM]]` | Rechtsform (z. B. Einzelunternehmen, GmbH, AG) | Abschnitt 1 |
| `[[STRASSE_NR]]` | Strasse und Hausnummer des Geschäftssitzes | Abschnitt 1 |
| `[[PLZ_ORT]]` | Postleitzahl und Ort des Geschäftssitzes | Abschnitt 1 |
| `[[EMAIL_DATENSCHUTZ]]` | Kontaktadresse für Datenschutzanliegen (kann dieselbe sein wie die allgemeine Kontaktadresse im Impressum) | Abschnitt 1, 9.5, 11 |
| `[[DOMAIN]]` | Echte Domain, unter der Cornice und die Rechtstexte erreichbar sind | Abschnitt 2.1, 14 |
| `[[SUPABASE_REGION]]` | Region, in der das Supabase-Projekt betrieben wird (bestimmt den Speicherort der Kerndaten) | Abschnitt 7 |
| `[[VERCEL_REGION]]` | Region, in der die Anwendung bei Vercel ausgeführt wird | Abschnitt 7 |
| `[[STAND_DATUM]]` | Datum, ab dem diese Fassung gilt | Kopfzeile |

Insgesamt **9 Platzhalter**. Vor der Veröffentlichung ist im gesamten Dokument
nach der Zeichenfolge `[[` zu suchen, um sicherzustellen, dass kein Platzhalter
übrig geblieben ist.

## Offene Punkte für die anwaltliche und fachliche Prüfung

1. **Anwendbarkeit der DSGVO** — richtet sich das Angebot bewusst auch an
   Personen in der EU/im EWR? Falls ja, ist zu prüfen, ob eine
   EU-Vertretung nach Art. 27 DSGVO nötig ist. Abschnitt 2.2 und 5.2 sind
   entsprechend anzupassen oder zu streichen.
2. **Bearbeitungsverzeichnis (Art. 12 DSG)** — die KMU-Ausnahme greift nur bei
   Bearbeitungen mit geringem Risiko. Systematisch erhobene Bewegungsdaten
   sprechen dagegen. Ein Verzeichnis ist vermutlich zu führen.
3. **Datenschutz-Folgenabschätzung (Art. 22 DSG)** — angesichts der
   systematischen Erfassung von GPS-Bewegungsdaten ist zu prüfen, ob eine
   Folgenabschätzung nötig ist.
4. **Auftragsbearbeitungsverträge** — für Supabase, Vercel, Stripe und Mapbox
   sind die jeweiligen Verträge abzuschliessen bzw. zu dokumentieren
   (Art. 9 DSG).
5. **Auslandbekanntgabe pro Anbieter belegen** (Abschnitt 8) sowie die
   Speicherregionen für die beiden Platzhalter ermitteln.
6. **Betreiber und Sitz von Open-Meteo** sind vor der Veröffentlichung zu
   verifizieren und in die Tabelle in Abschnitt 7 einzutragen. Zugleich ist
   die kommerzielle Lizenzfrage zu klären (`docs/premium-plan.md`,
   Abschnitt 5.4) — sie ist ein Startblocker.
7. **Nutzungsbedingungen von geo.admin.ch** für die kommerzielle Nutzung
   prüfen (`docs/premium-plan.md`, Abschnitt 5.4).
8. **E-Mail-Versand** — wird für die Konto-E-Mails ein eigener
   SMTP-Dienstleister konfiguriert, ist dieser in Abschnitt 7 zu ergänzen.
9. **Aussagen zu Vercel Web Analytics** (Abschnitt 3.10) sind gegen die
   aktuelle Anbieterdokumentation zu verifizieren.
10. **Profilbilder liegen weiterhin öffentlich** (Abschnitt 3.5) — für
    Fahrt-Fotos ist der Speicher inzwischen privat und die Links sind
    zeitlich begrenzt (Migration 0061), für Profilbilder bewusst noch nicht.
    Ob das so bleiben soll, ist eine Produktentscheidung: die Umstellung
    beträfe Bestenlisten, Feed, Folgen-Listen und Profilsuche, also Listen,
    die pro Seitenaufruf viele Links signieren müssten.
11. **Bildausrichtung als einzige verbleibende Metainformation**
    (Abschnitt 3.5) — beim Entfernen der Metadaten wird die
    Ausrichtungsangabe neu und minimal geschrieben, damit hochkant
    aufgenommene Fotos nicht gedreht erscheinen. Sie enthält keine
    personenbezogene Information; der Hinweis im Text sollte trotzdem
    bestätigt werden.
12. **Voreinstellung der Sichtbarkeits-Schalter** (Abschnitte 3.2 und 6) —
    im Repository liegt mit `0054_sichtbarkeit_standardmaessig_aktiv.sql`
    eine Migration, die diese Schalter von Opt-in auf Opt-out umstellen
    würde. Sie ist in der Produktionsdatenbank **nicht eingespielt**, die
    Schalter stehen dort weiterhin auf „aus"; dieser Text beschreibt den
    tatsächlichen Zustand. Wird die Migration nachgezogen, ist der Text
    zwingend mitzuändern — und vorher zu prüfen, ob sich eine solche
    Voreinstellung auf eine Einwilligung stützen lässt (Grundsatz
    „Datenschutz durch Voreinstellung", Art. 7 DSG bzw. Art. 25 DSGVO).
