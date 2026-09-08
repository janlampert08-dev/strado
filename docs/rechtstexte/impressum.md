# Impressum

> ## Arbeitsfassung des veröffentlichten Impressums — keine Rechtsberatung
>
> Dieser Text ist von einem KI-Assistenten erstellt und **anwaltlich nicht
> geprüft**; er stellt **keine Rechtsberatung** dar. Er ist seit dem
> 2026-09-07 mit den tatsächlichen Angaben unter
> `https://strado.ch/legal/impressum` veröffentlicht — Entscheid des
> Inhabers, ohne vorgängige anwaltliche Prüfung zu publizieren.
>
> Es gibt **keine Platzhalter** mehr in diesem Dokument (Stand 2026-09-07).
>
> Entwurfsdatum: 2026-09-06 · Stand der veröffentlichten Fassung:
> 7. September 2026

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

Jan Lampert
Einzelunternehmen, nicht im Handelsregister eingetragen

**Adresse**

c/o Softsite AG
Leutschenbachstrasse 45
8050 Zürich
Schweiz

**Kontakt**

E-Mail: contact@strado.ch

> **Zur Kontaktangabe:** Es wird bewusst nur die E-Mail-Adresse genannt;
> die Telefonzeile ist ersatzlos gestrichen (Entscheid 2026-09-07). Formal
> genügt eine der beiden Kontaktangaben, die E-Mail-Adresse ist die
> zwingende, weil Art. 3 Abs. 1 lit. s UWG sie ausdrücklich verlangt. Dass
> `contact@strado.ch` Post empfängt, ist am 2026-09-07 bestätigt worden.

---

## Ergänzende Angaben

Diese Angaben sind für die TWINT-Freischaltung nicht zwingend, gehören aber
in ein vollständiges Impressum, sobald sie zutreffen. Trifft eine Angabe
nicht zu (z. B. keine Eintragung im Handelsregister, keine MWST-Pflicht), ist
die betreffende Zeile ersatzlos zu **streichen** — nicht mit „entfällt" zu
füllen und schon gar nicht mit dem Platzhalter zu belassen.

| Angabe | Wert |
| --- | --- |
| Vertretungsberechtigte Person | Jan Lampert |
| Verantwortlich für den Inhalt | Jan Lampert |

> **Zu UID und MWST-Nummer:** Beide Zeilen sind gestrichen, nicht leer
> gelassen (Entscheid 2026-09-07). Das Einzelunternehmen ist nicht im
> Handelsregister eingetragen, und die Mehrwertsteuerpflicht beginnt erst ab
> CHF 100'000 Jahresumsatz aus steuerbaren Leistungen (Kostenmodell in
> `docs/premium-plan.md`, Abschnitt 5.4) — der Umsatz liegt darunter. Die
> Preise werden trotzdem von Anfang an als Endpreise inklusive allfälliger
> MWST kommuniziert (siehe AGB Ziff. 4), damit sich am ausgewiesenen Betrag
> nichts ändert, falls die Steuerpflicht einmal eintritt. Entsteht sie,
> gehören UID und MWST-Nummer hier wieder hinein — in beiden Fassungen.

---

## Weitere Rechtstexte

- Allgemeine Geschäftsbedingungen: `https://strado.ch/legal/agb`
- Datenschutzerklärung: `https://strado.ch/legal/datenschutz`

> **Technischer Hinweis (nicht Teil des veröffentlichten Impressums):** Diese
> drei Entwürfe sind am 2026-09-06 als HTML unter `legal/` im Repo
> `janlampert08-dev/stradoinfo` veröffentlicht worden; `LEGAL_URLS` in
> `lib/constants.ts` zeigt darauf. Die Entwürfe hier bleiben die Arbeitsfassung
> — **wer den einen ändert, muss den anderen mitziehen.** Seit dem 2026-09-07
> sind die Platzhalter in beiden Fassungen eingesetzt; die orange markierten
> `.todo`-Felder und die Entwurfsbanner der HTML-Seiten sind entfernt.
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
> Blocker 1 aus `docs/premium-plan.md`, Abschnitt 8, ist damit vollständig
> erledigt: Domain und Pflichtangaben stehen.

---

## Verwendete Platzhalter

Keine mehr. Alle Platzhalter sind am 2026-09-07 durch die tatsächlichen
Werte ersetzt worden; eine Suche nach doppelten eckigen Klammern im gesamten
Dokument muss leer bleiben und ist Teil der Prüfung vor jeder weiteren
Änderung.
