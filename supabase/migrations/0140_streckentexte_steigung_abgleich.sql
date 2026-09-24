-- =====================================================================
-- 0140 — Streckentexte: Steigungsangaben an die Kennzahl angeglichen
-- =====================================================================
--
-- WARUM
-- Auf der Streckenseite steht der redaktionelle Text (routes.charakter_text)
-- direkt über den gerechneten Kennzahlen. Zwei Texte nannten eine Steigung,
-- die über der Kachel "Max. Steigung" darunter liegt:
--
--   Ächerlipass  Text "steigt bis zu 16 Prozent"      Kachel 12.8 %
--   Ratenpass    Text "erreicht bis zu 9 Prozent"     Kachel  7.7 %
--
-- Falsch ist dabei nicht zwingend der Text: die Kachel ist das 90.
-- Perzentil über 150-m-Fenster auf dem geglätteten Höhenprofil
-- (computeHoeheUndSteigung in lib/elevation.ts), kein absolutes Maximum.
-- Gemessen am gespeicherten Profil (Punktabstand 125–245 m): Ächerli
-- steilster Profilschritt 14.8 %, Raten 10.6 % — eine Tafel am Strassenrand
-- zeigt lokal mehr. Für den Leser ist es trotzdem ein Widerspruch auf einem
-- Bildschirm. Da die Kachel die gerechnete Grösse bleibt und die
-- Textzahlen nicht belegt sind, fällt die Zahl im Text weg; die Aussage
-- bleibt als Wort stehen, soweit die Daten sie stützen (Ächerli hat nach
-- Etzel die zweithöchste Kennzahl aller Strecken).
--
-- Alle 32 freigegebenen, öffentlichen Strecken wurden geprüft (SELECT,
-- 2026-09-25): Zahlen mit Einheit stehen nur in fünf Texten (Ächerli, Etzel,
-- Gurnigel, Raten, Schwägalp). Längen ("rund 20 km") und Höhen ("(950 m)")
-- stimmen überall; Schwägalp nennt die Passhöhe 1278 m, die Kennzahl ist der
-- höchste Punkt des Tracks (1299 m) — kein Widerspruch. Die Tabelle steht im
-- PR-Text. lib/streckentextAbgleich.ts prüft künftige Texte mit denselben
-- Regeln.
--
-- WAS
-- Zwei UPDATEs auf routes.charakter_text, je per id UND mit dem alten Text
-- als Bedingung: wurde ein Text inzwischen von Hand geändert, trifft das
-- UPDATE nichts, statt eine neuere Fassung zu überschreiben. Keine
-- Schemaänderung, keine Funktion, keine Berechtigung.
--
-- PRÜFEN (nach dem Einspielen)
--   select name, charakter_text from routes
--    where id in ('1b8461e1-7eae-4262-82cf-c6827af63ae2',
--                 '418aeca1-7a74-4407-9040-ef1815bf3bf9');
--   → beide Texte ohne "Prozent". Trifft ein UPDATE 0 Zeilen, war der Text
--     schon anders: dann von Hand ansehen.
--   Offline gespeicherte Strecken (lib/offlineRoutes.ts) behalten den alten
--   Text, bis sie neu gespeichert werden — gewollt, es ist eine Kopie.
--
-- ZURÜCK
--   update routes set charakter_text = 'Von Kerns über das Ächerli nach Dallenwil, rund 20 km. Die Strasse ist meist einspurig mit Ausweichstellen und steigt bis zu 16 Prozent. Unterwegs sieht man Pilatus, Rigi, Stanserhorn und Titlis.'
--    where id = '1b8461e1-7eae-4262-82cf-c6827af63ae2';
--   update routes set charakter_text = 'Von Oberägeri über den Raten (1077 m) nach Biberbrugg, rund 11 km. Die Steigung erreicht bis zu 9 Prozent.'
--    where id = '418aeca1-7a74-4407-9040-ef1815bf3bf9';
-- =====================================================================

update public.routes
   set charakter_text = 'Von Kerns über das Ächerli nach Dallenwil, rund 20 km. Die Strasse ist meist einspurig mit Ausweichstellen und stellenweise sehr steil. Unterwegs sieht man Pilatus, Rigi, Stanserhorn und Titlis.'
 where id = '1b8461e1-7eae-4262-82cf-c6827af63ae2'
   and charakter_text = 'Von Kerns über das Ächerli nach Dallenwil, rund 20 km. Die Strasse ist meist einspurig mit Ausweichstellen und steigt bis zu 16 Prozent. Unterwegs sieht man Pilatus, Rigi, Stanserhorn und Titlis.';

update public.routes
   set charakter_text = 'Von Oberägeri über den Raten (1077 m) nach Biberbrugg, rund 11 km. Die Steigung bleibt meist moderat.'
 where id = '418aeca1-7a74-4407-9040-ef1815bf3bf9'
   and charakter_text = 'Von Oberägeri über den Raten (1077 m) nach Biberbrugg, rund 11 km. Die Steigung erreicht bis zu 9 Prozent.';
