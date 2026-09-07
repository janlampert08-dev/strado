# Impressum

> ## ⚠️ Ungeprüfter Entwurf — keine Rechtsberatung
>
> Dieser Text ist ein **von einem KI-Assistenten erstellter, ungeprüfter
> Entwurf**. Er stellt **keine Rechtsberatung** dar und darf in dieser Form
> **nicht veröffentlicht** werden. Vor der Publikation muss er von einer
> **qualifizierten Schweizer Anwältin oder einem qualifizierten Schweizer
> Anwalt** geprüft und freigegeben werden.
>
> Alle Angaben in doppelten eckigen Klammern (`[[…]]`) sind **Platzhalter**.
> Sie wurden bewusst **nicht** erfunden und müssen vor der Veröffentlichung
> durch die echten Werte ersetzt werden. Eine vollständige Liste steht am
> Ende dieses Dokuments.
>
> Entwurfsdatum: 2026-09-06

---

## Warum es dieses Impressum braucht

Zwei voneinander unabhängige Gründe:

1. **Gesetzlich** — Art. 3 Abs. 1 lit. s UWG verpflichtet Anbieterinnen im
   elektronischen Geschäftsverkehr, klare Angaben zu ihrer Identität und
   ihrer Kontaktadresse (inklusive E-Mail) zu machen.
2. **Vertraglich gegenüber TWINT** — die TWINT-Freischaltung über Stripe
   setzt eine erreichbare Website mit Firmenname, vollständiger Adresse und
   Kontaktangaben voraus (siehe `docs/premium-plan.md`, Abschnitt 6 und
   Blocker 1 in Abschnitt 8). Ohne diese Angaben gibt es kein TWINT und damit
   kein sinnvolles Schweizer Zahlungsmittel für das Premium-Abo.

---

## Pflichtangaben

Die folgenden Felder decken die Anforderungen der TWINT-/Stripe-Onboarding-
Prüfung ab: Firmenname inklusive Rechtsform, vollständige Adresse mit Strasse,
Hausnummer, Postleitzahl und Ort sowie mindestens eine der beiden
Kontaktmöglichkeiten E-Mail oder Telefon.

**Firma und Rechtsform**

[[FIRMENNAME]] [[RECHTSFORM]]

**Adresse**

[[STRASSE_NR]]
[[PLZ_ORT]]
Schweiz

**Kontakt**

E-Mail: contact@strado.ch
Telefon: [[TELEFON]]

> **Hinweis für die Fertigstellung:** Es genügt formal *eine* der beiden
> Kontaktangaben. Für die TWINT-Freischaltung sollten dennoch beide angegeben
> werden — die E-Mail-Adresse zwingend, weil Art. 3 Abs. 1 lit. s UWG sie
> ausdrücklich verlangt. Wird auf die Telefonnummer verzichtet, ist die
> gesamte Zeile zu entfernen, nicht der Platzhalter stehen zu lassen.

---

## Ergänzende Angaben

Diese Angaben sind für die TWINT-Freischaltung nicht zwingend, gehören aber
in ein vollständiges Impressum, sobald sie zutreffen. Trifft eine Angabe
nicht zu (z. B. keine Eintragung im Handelsregister, keine MWST-Pflicht), ist
die betreffende Zeile ersatzlos zu **streichen** — nicht mit „entfällt" zu
füllen und schon gar nicht mit dem Platzhalter zu belassen.

| Angabe | Wert |
| --- | --- |
| Vertretungsberechtigte Person | [[VERTRETUNGSBERECHTIGTE_PERSON]] |
| Unternehmens-Identifikationsnummer (UID) / Handelsregister | [[UID_NR]] |
| MWST-Nummer | [[MWST_NR]] |
| Verantwortlich für den Inhalt | [[VERTRETUNGSBERECHTIGTE_PERSON]] |

> **Zur MWST-Nummer:** Nach dem Kostenmodell in `docs/premium-plan.md`
> (Abschnitt 5.4) beginnt die Mehrwertsteuerpflicht erst ab CHF 100'000
> Jahresumsatz aus steuerbaren Leistungen. Solange diese Schwelle nicht
> erreicht ist, gibt es keine MWST-Nummer und die Zeile entfällt. Die Preise
> werden trotzdem von Anfang an als Endpreise inklusive allfälliger MWST
> kommuniziert (siehe AGB Ziff. 4).

---

## Weitere Rechtstexte

- Allgemeine Geschäftsbedingungen: `https://strado.ch/legal/agb`
- Datenschutzerklärung: `https://strado.ch/legal/datenschutz`

> **Technischer Hinweis (nicht Teil des veröffentlichten Impressums):** Diese
> drei Entwürfe sind am 2026-09-06 als HTML unter `legal/` im Repo
> `janlampert08-dev/stradoinfo` veröffentlicht worden; `LEGAL_URLS` in
> `lib/constants.ts` zeigt darauf. Die Entwürfe hier bleiben die Arbeitsfassung
> — **wer den einen ändert, muss den anderen mitziehen.** Die Platzhalter
> stehen in den HTML-Seiten als orange markierte `.todo`-Felder.
>
> **Die Domain ist registriert und ausgeliefert.** `strado.ch` liefert die
> Rechtstexte unter `/legal/…` aus (die Apex-Domain antwortet mit 308 auf
> `www.strado.ch`, der Pfad bleibt erhalten), die Webanwendung läuft unter
> `app.strado.ch`. `LEGAL_URLS` in `lib/constants.ts` fällt deshalb auf
> `https://strado.ch` zurück; `NEXT_PUBLIC_LEGAL_BASE_URL` muss dafür nicht
> mehr gesetzt werden. Der frühere Übergangswert `cornice-ch.vercel.app` und
> das ursprüngliche `xyz.ch` sind damit aus allen Links verschwunden — die
> Regel dahinter bleibt: unter der Überschrift „Impressum" steht nur eine
> Adresse, die uns gehört und die antwortet.
>
> Offen aus Blocker 1 (`docs/premium-plan.md`, Abschnitt 8) sind nur noch
> die Pflichtangaben in der Platzhalter-Tabelle unten, nicht mehr die
> Domain.

---

## Verwendete Platzhalter

| Platzhalter | Bedeutung | Beispielform |
| --- | --- | --- |
| `[[FIRMENNAME]]` | Firmenname der Betreiberin, wie im Handelsregister bzw. gegenüber Stripe/TWINT geführt | — |
| `[[RECHTSFORM]]` | Rechtsform (z. B. Einzelunternehmen, GmbH, AG) | — |
| `[[STRASSE_NR]]` | Strasse und Hausnummer des Geschäftssitzes | — |
| `[[PLZ_ORT]]` | Postleitzahl und Ort des Geschäftssitzes | — |
| `[[TELEFON]]` | Telefonnummer im internationalen Format | — |
| `[[VERTRETUNGSBERECHTIGTE_PERSON]]` | Name der vertretungsberechtigten bzw. inhaltlich verantwortlichen Person | — |
| `[[UID_NR]]` | Unternehmens-Identifikationsnummer / Handelsregisternummer | Form `CHE-###.###.###` |
| `[[MWST_NR]]` | MWST-Nummer, nur bei bestehender Steuerpflicht | Form `CHE-###.###.### MWST` |

Insgesamt **8 Platzhalter**. Vor der Veröffentlichung ist im gesamten
Dokument nach der Zeichenfolge `[[` zu suchen, um sicherzustellen, dass kein
Platzhalter übrig geblieben ist.
