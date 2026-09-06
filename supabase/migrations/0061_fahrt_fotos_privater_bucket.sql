-- Fahrt-Fotos aus dem öffentlich lesbaren Speicher nehmen.
--
-- Der Bucket route-photos war seit 0003_storage.sql öffentlich, mit einer
-- Lesepolicy ohne jede Bedingung ("bucket_id = 'route-photos'"). Wer die
-- vollständige URL einer Datei kannte, konnte sie abrufen — auch dann, wenn
-- die zugehörige Fahrt auf privat stand. Die Datenbankschicht war dabei
-- immer korrekt: route_photos und public_completion_photos filtern auf
-- ist_oeffentlich, die Anwendung zeigte private Fotos also nie an. Undicht
-- war ausschliesslich die Datei selbst, und ihre URL überlebt jedes
-- Zurückstellen auf privat: einmal geteilt, dauerhaft abrufbar.
--
-- Ab jetzt ist der Bucket privat und die Anwendung signiert Links beim Lesen
-- (lib/storageUrls.ts). Die Signatur läuft ab, ein weitergegebener Link also
-- auch.
--
-- ================= REIHENFOLGE BEACHTEN =================
-- Diese Migration ist die Ausnahme von der sonstigen Regel "Migration vor dem
-- Deploy einspielen" (supabase/migrations/README.md). Sie macht die bisher
-- ausgelieferten öffentlichen URLs ungültig. Wird sie eingespielt, solange
-- noch der alte Code läuft, zeigt jede Fahrt sofort kaputte Bilder — der
-- alte Code kennt das Signieren nicht.
--
-- Deshalb: ZUERST den Code deployen, der signiert, DANN diese Migration
-- einspielen. Zwischen beiden Schritten funktionieren die öffentlichen URLs
-- weiter, der neue Code signiert sie zusätzlich — beides gleichzeitig gültig,
-- kein Loch.
-- ========================================================

update storage.buckets set public = false where id = 'route-photos';

-- Die bedingungslose Lesepolicy ersetzen. Sie ist nicht nur für den
-- öffentlichen Endpunkt relevant: ohne sie könnte sonst jeder Client mit dem
-- öffentlichen anon-Key selbst signierte Links für beliebige Pfade erzeugen
-- und hätte damit exakt den alten Zustand zurück.
drop policy if exists "Fahrt-Fotos sind öffentlich lesbar" on storage.objects;

-- Direktzugriff bleibt auf den eigenen Ordner beschränkt — dieselbe Regel,
-- die schon für Upload und Löschen gilt.
--
-- Fotos fremder, öffentlicher Fahrten werden bewusst NICHT hier freigegeben.
-- Die Bedingung dafür hängt an route_completions.ist_oeffentlich und liesse
-- sich in einer Storage-Policy nur über einen Rückweg vom Objektpfad auf die
-- gespeicherte URL nachbilden (ein LIKE über completion_photos.foto_url) —
-- teuer bei jedem Abruf und fragil gegenüber jeder Änderung am URL-Format.
-- Stattdessen signiert der Server, der die Sichtbarkeit ohnehin schon
-- geprüft hat, weil seine Zeilen aus den gefilterten Views stammen.
create policy "Nutzer lesen eigene Fahrt-Fotos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'route-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Der avatars-Bucket bleibt vorerst öffentlich. Das ist eine bewusste
-- Entscheidung und kein Versehen: ein Profilbild ist ein selbst gewähltes,
-- nach aussen gerichtetes Bild, und der Schalter zeigt_avatar steuert seine
-- Anzeige, nicht seine Existenz. Die Umstellung wäre zudem deutlich
-- breiter — Avatare erscheinen in Bestenlisten, Feed, Folgen-Listen und der
-- Profilsuche, also in Listen, die pro Seitenaufruf viele Links signieren
-- müssten. Siehe die offenen Punkte in docs/rechtstexte/datenschutz.md.
