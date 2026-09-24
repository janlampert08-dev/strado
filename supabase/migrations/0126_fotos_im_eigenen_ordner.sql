-- =====================================================================
-- 0126 — Foto-Verweise nur in den eigenen Storage-Ordner
-- =====================================================================
--
-- Der Server signiert Foto-Links mit dem Service-Role-Client
-- (lib/storageUrls.ts, signiereFotoUrls): welchen Pfad er signiert, liest
-- er aus completion_photos.foto_url bzw. route_completions.foto_url. Beide
-- Spalten schreibt authenticated selbst (INSERT-Grant), und die RLS-Prüfung
-- auf completion_photos sieht nur user_id und den Besitz der Fahrt — nie,
-- WOHIN der Verweis zeigt.
--
-- Damit liess sich ein fremdes Foto freischalten: Pfad eines Opfer-Fotos
-- merken, solange dessen Fahrt öffentlich ist (er steht in jedem signierten
-- Link), später — nachdem das Opfer die Fahrt privat gestellt hat — über
-- PostgREST eine completion_photos-Zeile an eine EIGENE öffentliche Fahrt
-- hängen, mit foto_url = …/route-photos/<opfer-id>/<uuid>.jpg. Die Seite
-- dieser Fahrt signiert dann das private Foto des Opfers, für jeden
-- sichtbar. (Sicherheitsaudit 2026-09-24, M1; als latentes Risiko schon
-- am 2026-09-07 vermerkt.)
--
-- Der Upload legt jede Datei unter "<user_id>/<uuid>.<ext>" ab
-- (lib/actions/fotos.ts), und der Bucket lässt Clients nur in den eigenen
-- Ordner schreiben (0061). Ein Verweis ausserhalb des eigenen Ordners hat
-- also keinen legitimen Ursprung — ein CHECK schliesst ihn aus, unabhängig
-- davon, über welchen Weg die Zeile entsteht.
--
-- Am 2026-09-24 geprüft: 0 Zeilen in completion_photos, 0 Fahrten mit
-- foto_url — der Constraint wird deshalb gleich validiert, nicht NOT VALID.

alter table public.completion_photos
  add constraint completion_photos_foto_im_eigenen_ordner
  check (foto_url like '%/route-photos/' || user_id::text || '/%');

alter table public.route_completions
  add constraint route_completions_foto_im_eigenen_ordner
  check (foto_url is null or foto_url like '%/route-photos/' || user_id::text || '/%');
