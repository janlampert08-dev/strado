-- =====================================================================
-- Eigene Strecken anlegen wird Premium (oder Moderation).
--
-- Produktentscheid vom 2026-09-07. Die INSERT-Policy auf public.routes
-- verlangt neu, dass das anlegende Konto entweder ist_premium oder
-- is_moderator trägt. Alles andere an der Policy bleibt, wie 0027 es
-- gesetzt hat: nur die eigene Zeile, nur mit status_ok = false.
--
-- ---------------------------------------------------------------------
-- Das ist ein bewusster Bruch mit dem "additiven Gating"
-- ---------------------------------------------------------------------
-- docs/premium-plan.md, Abschnitt 4, und der Kopf von lib/premiumLimits.ts
-- legen fest, dass Premium Obergrenzen anhebt und nichts wegnimmt, was
-- ein kostenloses Konto bisher konnte. Das Anlegen eigener Strecken war
-- bisher für jedes angemeldete Konto offen (kostenlos: eine private
-- Strecke, Vorschläge unbegrenzt). Diese Migration nimmt es kostenlosen
-- Konten weg — nicht nebenbei, sondern als Entscheid des Betreibers, der
-- die AGB (Ziff. 3.1/3.2) in einem eigenen PR nachzieht. Kernregel 16
-- verlangt, dass so etwas ausgesprochen wird; hier steht es.
--
-- ---------------------------------------------------------------------
-- Nur das Anlegen ist gesperrt
-- ---------------------------------------------------------------------
-- Diese Migration fasst ausschliesslich die INSERT-Policy an. Bestehende
-- Strecken bleiben, was sie sind: eigene unverifizierte Strecken lassen
-- sich weiter bearbeiten (UPDATE-Policy 0001:112), private Strecken
-- weiter veröffentlichen (publishPrivateRoute), abgelehnte weiter löschen
-- (0012). Der Bestandsschutz für private Strecken aus 0064/0067 bleibt
-- unberührt — er begrenzt das Setzen von ist_privat, nicht das Anlegen,
-- und läuft hinter dieser Schranke einfach weiter. Wer vor dem Stichtag
-- Strecken angelegt hat, verliert keine davon.
--
-- ---------------------------------------------------------------------
-- Warum die Policy und nicht (nur) die Server Action
-- ---------------------------------------------------------------------
-- proposeRoute (lib/actions/routes.ts) prüft dasselbe vorab und antwortet
-- mit einer lesbaren Meldung. Das ist die Höflichkeit, nicht die
-- Schranke. Die Schranke muss hier liegen, aus zwei Gründen:
--
--   1. propose_route_full ist SECURITY INVOKER (0027, bestätigt in 0072).
--      RLS gilt also auch innerhalb der RPC — diese Policy fängt den
--      Aufruf über die Server Action UND einen direkten
--      POST /rest/v1/rpc/propose_route_full mit dem Session-Token ab.
--   2. INSERT auf routes ist der Rolle authenticated weiterhin gegrantet
--      (0072 begründet, warum ein REVOKE den legitimen Pfad mitreissen
--      würde). Ein direkter POST /rest/v1/routes läuft an jeder
--      App-Prüfung vorbei — an dieser Policy nicht.
--
-- Ein Punkt, an dem beide Wege vorbeimüssen, statt zweier Prüfungen, die
-- auseinanderlaufen können.
--
-- ---------------------------------------------------------------------
-- Moderation bleibt ausgenommen
-- ---------------------------------------------------------------------
-- Moderatoren kuratieren den Streckenbestand und sollen dafür kein Abo
-- brauchen. is_moderator ist für authenticated lesbar (0034), und die
-- Moderator-Policies aus 0009/0027 stützen sich auf dieselbe Spalte —
-- hier kommt keine neue Vertrauensquelle dazu.
--
-- Beide Spalten sind für die eigene Zeile lesbar (SELECT-Grant 0034,
-- SELECT-Policy auf profiles), UPDATE darauf ist authenticated seit 0027
-- entzogen. Ein Konto kann sich also weder Premium noch die Moderation
-- selbst eintragen, um diese Prüfung zu passieren.
--
-- ---------------------------------------------------------------------
-- Reihenfolge beim Einspielen
-- ---------------------------------------------------------------------
-- Die Policy wirkt sofort für alle, unabhängig davon, welcher Code läuft.
-- Eingespielt vor dem Deploy zeigt der alte Code kostenlosen Konten noch
-- das Formular, und das Speichern scheitert mit "Strecke konnte nicht
-- gespeichert werden" statt mit dem Premium-Hinweis. Deshalb: Code zuerst
-- oder zusammen — siehe supabase/migrations/README.md.
-- =====================================================================

alter policy "Angemeldete Nutzer können Strecken vorschlagen" on public.routes
  with check (
    (erstellt_von = (select auth.uid()))
    and (status_ok = false)
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and (p.ist_premium or p.is_moderator)
    )
  );

comment on policy "Angemeldete Nutzer können Strecken vorschlagen" on public.routes is
  'Eigene Strecken anlegen ist Premium (profiles.ist_premium) oder Moderation (profiles.is_moderator); weiterhin nur die eigene Zeile und nur mit status_ok = false. Bewusster Bruch mit dem additiven Gating aus docs/premium-plan.md Abschnitt 4, Produktentscheid 2026-09-07 (0077). Gilt fuer die Server Action wie fuer den Direktweg ueber PostgREST, weil propose_route_full SECURITY INVOKER ist.';
