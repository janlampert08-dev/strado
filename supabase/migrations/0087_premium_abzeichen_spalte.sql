-- =====================================================================
-- Premium-Abzeichen: eine generierte Spalte, die nur das Ergebnis zeigt.
--
-- profiles.zeigt_premium_abzeichen ist genau (ist_premium AND
-- zeigt_premium_badge) — die Frage, die die Oberfläche stellt, wenn sie
-- entscheidet, ob hinter einem Namen das Signet steht.
--
-- ---------------------------------------------------------------------
-- Warum eine Spalte und nicht zwei Spalten in der App verknüpft
-- ---------------------------------------------------------------------
-- Weil die App dafür profiles.ist_premium lesen müsste. Dieses Feld ist
-- seit 0034 an anon UND authenticated freigegeben:
--
--   grant select (
--     id, display_name, created_at, is_moderator, zeigt_fahrzeuge,
--     avatar_url, zeigt_avatar, zeigt_paesse, zeigt_hoehenmeter,
--     zeigt_distanz, ist_premium, zeigt_premium_badge
--   ) on public.profiles to anon, authenticated;
--
-- Spalten-Grants gelten tabellenweit; welche ZEILEN sichtbar sind,
-- entscheidet RLS, und öffentliche Profile sind öffentlich. Ein direkter
-- PostgREST-Request liest damit heute den Abo-Status jeder Person — auch
-- der, die kein Abzeichen zeigen will.
--
-- Genau das wollten 0027 und 0028 für die Bestenlisten-Views
-- verhindern. Deren Kommentar sagt es wörtlich: die Views geben
-- (p.ist_premium and p.zeigt_premium_badge) bereits verrechnet aus,
-- "damit ein direkter PostgREST-Request nicht den rohen Premium-Status
-- eines Nutzers offenlegt, der das Abzeichen nicht öffentlich zeigen
-- möchte". Für die Basistabelle gilt das seit 0034 nicht mehr.
--
-- Diese Migration repariert das NICHT. Der Grant ist ein bestehender
-- Befund aus 0034, kein Ergebnis dieser Arbeit, und ihn hier nebenbei zu
-- entziehen hiesse, eine Leseberechtigung zu verengen, deren Aufrufer
-- niemand in diesem Schritt geprüft hat — getPremiumStatus() in
-- lib/premium.ts liest ist_premium für die eigene Zeile und hinge sofort
-- daran. Das ist ein eigener PR mit eigener Prüfung wert.
--
-- Was diese Migration stattdessen tut: sie sorgt dafür, dass der neue
-- Code sich gar nicht erst auf den rohen Wert stützt. Wird der Grant
-- später entzogen, muss am Abzeichen keine Zeile geändert werden.
--
-- ---------------------------------------------------------------------
-- Warum GENERATED und nicht eine View oder ein Trigger
-- ---------------------------------------------------------------------
-- Eine gespeicherte generierte Spalte kann nicht auseinanderlaufen: sie
-- wird bei jedem UPDATE der beiden Quellspalten mitgeschrieben, ohne dass
-- jemand daran denken muss. Der Ausdruck ist ein boolesches UND zweier
-- Spalten derselben Zeile und damit immutable, wie Postgres es verlangt.
--
-- Nebeneffekt, der ausdrücklich erwünscht ist: 0076 (Anonymisierung bei
-- Kontolöschung) setzt zeigt_premium_badge auf false und braucht dafür
-- keine Zeile mehr — die generierte Spalte folgt von selbst.
--
-- Die Spalte ist NOT NULL, ohne dass es dasteht: beide Quellspalten sind
-- seit 0021 "not null default false".
-- =====================================================================

alter table public.profiles
  add column zeigt_premium_abzeichen boolean
  generated always as (ist_premium and zeigt_premium_badge) stored;

comment on column public.profiles.zeigt_premium_abzeichen is
  'Abgeleitet: ist_premium AND zeigt_premium_badge. Die einzige Spalte, die die Oberfläche für das Abzeichen neben dem Namen lesen soll — sie legt den rohen Abo-Status nicht offen. Nicht direkt beschreibbar; gesetzt wird das Opt-in über zeigt_premium_badge.';

-- Spalten-Grants sind additiv; der Grant aus 0034 bleibt unberührt.
-- anon ist nötig, weil öffentliche Profile und der Feed auch abgemeldet
-- gelesen werden.
grant select (zeigt_premium_abzeichen) on public.profiles to anon, authenticated;
