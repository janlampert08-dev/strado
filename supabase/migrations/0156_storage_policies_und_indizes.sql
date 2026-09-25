-- =====================================================================
-- 0156 — Storage-Policies: auth.uid() einmal je Abfrage; drei doppelte
--        Indizes weg
-- =====================================================================
--
-- WARUM
-- a) Sechs Policies auf storage.objects rufen auth.uid() ungekapselt auf.
--    Postgres wertet den Ausdruck dann je Zeile aus statt einmal je
--    Abfrage (Supabase-Linter "auth_rls_initplan"). Mit (select auth.uid())
--    wird daraus ein InitPlan, der genau einmal läuft. Gleiche Bedeutung,
--    nur billiger — dasselbe, was 0139 für die Tabellen in public getan hat.
-- b) Drei Indizes sind ein Spalten-Präfix eines anderen Index auf derselben
--    Tabelle mit gleichem (bzw. keinem) Prädikat. Der längere Index bedient
--    jede Abfrage, die der kürzere bedient (auch die Fremdschlüssel-Prüfung
--    beim Löschen einer Strecke bzw. eines Creator-Links); der kürzere
--    kostet nur Schreibarbeit und Platz.
--
-- WAS SICH ÄNDERT
-- a) ALTER POLICY für die sechs Policies. Geändert wird AUSSCHLIESSLICH
--    auth.uid() → (select auth.uid()); Befehl, Rollen (authenticated),
--    Bucket-Bedingung und Ordnerprüfung bleiben Zeichen für Zeichen, wie
--    pg_policies sie am 2026-09-25 zeigte. "Nutzer aktualisieren eigenes
--    Avatar" hat heute keine WITH-CHECK-Klausel (Postgres nimmt dann USING
--    auch als Prüfung) — das bleibt so, es wird nur USING gesetzt.
--    "Avatare sind öffentlich lesbar" ruft auth.uid() nicht auf und bleibt
--    unberührt.
--
--    ACHTUNG — Eigentümer: storage.objects gehört supabase_storage_admin,
--    und die Rolle postgres ist (Katalog, 2026-09-25) kein Mitglied davon.
--    ALTER POLICY verlangt Tabelleneigentum und kann deshalb mit
--    "must be owner of table objects" (42501) scheitern. Damit das die
--    Index-Hälfte nicht mitreisst, steht Teil a) in einem eigenen Block, der
--    diesen Fehler abfängt und als NOTICE meldet; die sechs Änderungen
--    gelten dann alle oder keine. Erscheint die NOTICE, im Dashboard unter
--    Storage → Policies die sechs Policies von Hand bearbeiten und die
--    Ausdrücke unten ("Neu") eintragen:
--
--    Bucket route-photos:
--      "Nutzer laden Fotos in eigenen Ordner hoch" (INSERT, WITH CHECK)
--      "Nutzer lesen eigene Fahrt-Fotos"            (SELECT, USING)
--      "Nutzer löschen eigene Fahrt-Fotos"          (DELETE, USING)
--        Neu: ((bucket_id = 'route-photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text))
--    Bucket avatars:
--      "Nutzer laden eigenes Avatar hoch"           (INSERT, WITH CHECK)
--      "Nutzer aktualisieren eigenes Avatar"        (UPDATE, USING; kein WITH CHECK)
--      "Nutzer löschen eigenes Avatar"              (DELETE, USING)
--        Neu: ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text))
--
-- b) drop index if exists, ohne CONCURRENTLY: Migrationen laufen hier über
--    den SQL-Editor bzw. apply_migration in einer Transaktion, und DROP
--    INDEX CONCURRENTLY ist dort nicht erlaubt. Die Tabellen sind klein
--    (2026-09-25: route_completions 15, route_ratings 3,
--    creator_konversionen 1 Zeile), die kurze ACCESS-EXCLUSIVE-Sperre fällt
--    nicht ins Gewicht; lock_timeout verhindert, dass sie sich hinter einer
--    langen Abfrage anstellt und dabei andere Zugriffe aufhält.
--
--    Vorher im Katalog geprüft (pg_indexes/pg_index, 2026-09-25): alle
--    sechs beteiligten Indizes indisvalid und indisready, kein
--    Prädikat, keiner der drei gelöschten trägt eine Constraint.
--      route_completions_route_id_idx (route_id)
--        ⊂ route_completions_route_zeit_idx (route_id, dauer_sekunden)
--      route_ratings_route_id_idx (route_id)
--        ⊂ route_ratings_route_id_user_id_key (route_id, user_id) — UNIQUE,
--          Constraint-Index, bleibt ohnehin
--      creator_konversionen_code_art (code, art)
--        ⊂ creator_konversionen_code_art_zeit (code, art, ereignis_am)
--    Die Fremdschlüssel route_completions_route_id_fkey,
--    route_ratings_route_id_fkey und creator_konversionen_code_fkey sind
--    damit weiter durch einen Index mit führender Spalte gedeckt.
--
-- Reihenfolge: unabhängig vom Code, jederzeit einspielbar. Kein Code liest
-- Indexnamen, und die Policies bedeuten dasselbe wie vorher.
--
-- PRÜFEN
--   -- a) keine ungekapselten Aufrufe mehr (erwartet: 0 Zeilen)
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and (coalesce(qual, '') ~* '(?<!select )auth\.uid\(\)'
--        or coalesce(with_check, '') ~* '(?<!select )auth\.uid\(\)');
--   -- und die sechs Ausdrücke gegen "Neu" oben lesen:
--   select policyname, cmd, roles, qual, with_check from pg_policies
--    where schemaname = 'storage' and tablename = 'objects' order by 1;
--   -- b) erwartet: 0 Zeilen
--   select indexname from pg_indexes where schemaname = 'public'
--      and indexname in ('route_completions_route_id_idx',
--                        'route_ratings_route_id_idx',
--                        'creator_konversionen_code_art');
--   -- Funktionsprobe: ein Fahrt-Foto hochladen und wieder löschen, ein
--   -- Avatar ersetzen — beides als normales Konto auf staging.
--
-- ZURÜCK
--   Indizes (Definitionen aus pg_indexes, 2026-09-25):
--     CREATE INDEX route_completions_route_id_idx ON public.route_completions USING btree (route_id);
--     CREATE INDEX route_ratings_route_id_idx ON public.route_ratings USING btree (route_id);
--     CREATE INDEX creator_konversionen_code_art ON public.creator_konversionen USING btree (code, art);
--   Policies (alte Ausdrücke aus pg_policies, 2026-09-25):
--     alter policy "Nutzer laden Fotos in eigenen Ordner hoch" on storage.objects
--       with check ((bucket_id = 'route-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
--     alter policy "Nutzer lesen eigene Fahrt-Fotos" on storage.objects
--       using ((bucket_id = 'route-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
--     alter policy "Nutzer löschen eigene Fahrt-Fotos" on storage.objects
--       using ((bucket_id = 'route-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
--     alter policy "Nutzer laden eigenes Avatar hoch" on storage.objects
--       with check ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
--     alter policy "Nutzer aktualisieren eigenes Avatar" on storage.objects
--       using ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
--     alter policy "Nutzer löschen eigenes Avatar" on storage.objects
--       using ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
--   (Gleiche Eigentümer-Einschränkung wie oben: notfalls im Dashboard.)

-- ---------------------------------------------------------------------
-- a) Storage-Policies
-- ---------------------------------------------------------------------
do $$
begin
  alter policy "Nutzer laden Fotos in eigenen Ordner hoch" on storage.objects
    with check ((bucket_id = 'route-photos'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text));

  alter policy "Nutzer lesen eigene Fahrt-Fotos" on storage.objects
    using ((bucket_id = 'route-photos'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text));

  alter policy "Nutzer löschen eigene Fahrt-Fotos" on storage.objects
    using ((bucket_id = 'route-photos'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text));

  alter policy "Nutzer laden eigenes Avatar hoch" on storage.objects
    with check ((bucket_id = 'avatars'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text));

  alter policy "Nutzer aktualisieren eigenes Avatar" on storage.objects
    using ((bucket_id = 'avatars'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text));

  alter policy "Nutzer löschen eigenes Avatar" on storage.objects
    using ((bucket_id = 'avatars'::text) and ((storage.foldername(name))[1] = ((select auth.uid()))::text));
exception
  when insufficient_privilege then
    raise notice '0156: Storage-Policies NICHT geändert (%). Bitte im Dashboard unter Storage -> Policies nachziehen, Ausdrücke im Kopf dieser Migration.', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------
-- b) Doppelte Indizes
-- ---------------------------------------------------------------------
set lock_timeout = '5s';

drop index if exists public.route_completions_route_id_idx;
drop index if exists public.route_ratings_route_id_idx;
drop index if exists public.creator_konversionen_code_art;

reset lock_timeout;
