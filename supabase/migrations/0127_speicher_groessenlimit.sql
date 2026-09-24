-- =====================================================================
-- 0127 — Grössenlimit für beide Storage-Buckets
-- =====================================================================
--
-- Die App prüft Dateigrössen selbst: 4 MB für Profilbilder
-- (MAX_AVATAR_BYTES, lib/actions/profile.ts) und 8 MB für Fahrtfotos
-- (MAX_FOTO_BYTES, lib/actions/completions.ts). Seit Fahrtfotos direkt aus
-- dem Browser in den Bucket gehen (signierte Upload-Tickets,
-- lib/actions/fotos.ts), läuft die Datei aber nicht mehr durch diese
-- Prüfung — und die Buckets selbst hatten kein Limit (file_size_limit
-- null). Wer ein Ticket hat, konnte also beliebig grosse Dateien ablegen:
-- Speicherkosten und, im öffentlichen avatars-Bucket, kostenloses Hosting
-- auf unsere Rechnung. (Sicherheitsaudit 2026-09-24, L2.)
--
-- Die Werte sind dieselben wie in der App, damit Datenbank und Oberfläche
-- dieselbe Grenze nennen. Am 2026-09-24 geprüft: grösste vorhandene Datei
-- 1.85 MB (avatars), route-photos leer — nichts Bestehendes ist betroffen,
-- das Limit greift ohnehin nur bei neuen Uploads.

update storage.buckets set file_size_limit = 4 * 1024 * 1024 where id = 'avatars';
update storage.buckets set file_size_limit = 8 * 1024 * 1024 where id = 'route-photos';
