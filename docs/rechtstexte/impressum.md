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

E-Mail: [[EMAIL]]
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

- Allgemeine Geschäftsbedingungen: `https://[[DOMAIN]]/legal/agb`
- Datenschutzerklärung: `https://[[DOMAIN]]/legal/datenschutz`

> **Technischer Hinweis (nicht Teil des veröffentlichten Impressums):** Diese
> drei Entwürfe sind am 2026-09-06 als HTML unter `legal/` im Repo
> `janlampert08-dev/cornice.ch` veröffentlicht worden; `LEGAL_URLS` in
> `lib/constants.ts` zeigt darauf. Die Entwürfe hier bleiben die Arbeitsfassung
> — **wer den einen ändert, muss den anderen mitziehen.** Die Platzhalter
> stehen in den HTML-Seiten als orange markierte `.todo`-Felder.
>
> Die Domain `cornice.ch` ist bei Vercel noch nicht eingetragen. Solange das
> so ist, muss `NEXT_PUBLIC_LEGAL_BASE_URL` auf `https://cornice-ch.vercel.app`
> gesetzt sein, sonst zeigen die Links in der App ins Leere. Das ist der Rest
> von Blocker 1 aus `docs/premium-plan.md`, Abschnitt 8.

---

## Verwendete Platzhalter

| Platzhalter | Bedeutung | Beispielform |
| --- | --- | --- |
| `[[FIRMENNAME]]` | Firmenname der Betreiberin, wie im Handelsregister bzw. gegenüber Stripe/TWINT geführt | — |
| `[[RECHTSFORM]]` | Rechtsform (z. B. Einzelunternehmen, GmbH, AG) | — |
| `[[STRASSE_NR]]` | Strasse und Hausnummer des Geschäftssitzes | — |
| `[[PLZ_ORT]]` | Postleitzahl und Ort des Geschäftssitzes | — |
| `[[EMAIL]]` | Allgemeine Kontakt-E-Mail-Adresse | — |
| `[[TELEFON]]` | Telefonnummer im internationalen Format | — |
| `[[VERTRETUNGSBERECHTIGTE_PERSON]]` | Name der vertretungsberechtigten bzw. inhaltlich verantwortlichen Person | — |
| `[[UID_NR]]` | Unternehmens-Identifikationsnummer / Handelsregisternummer | Form `CHE-###.###.###` |
| `[[MWST_NR]]` | MWST-Nummer, nur bei bestehender Steuerpflicht | Form `CHE-###.###.### MWST` |
| `[[DOMAIN]]` | Echte Domain, unter der die Rechtstexte erreichbar sind | — |

Insgesamt **10 Platzhalter**. Vor der Veröffentlichung ist im gesamten
Dokument nach der Zeichenfolge `[[` zu suchen, um sicherzustellen, dass kein
Platzhalter übrig geblieben ist.
