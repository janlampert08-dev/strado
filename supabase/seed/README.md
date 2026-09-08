# Seed-Daten

Dieses Verzeichnis enthält die **kuratierten Strecken** — Datenzeilen, keine
Schemaänderungen. Migrationen gehören nach `supabase/migrations/`; was hier
liegt, ändert nie eine Tabelle, sondern füllt nur `public.routes`.

## Diese Dateien laufen nicht automatisch

Wie bei den Migrationen (siehe `supabase/migrations/README.md`) spielt weder
CI noch Vercel etwas davon ein. Eine Datei hier ist erst dann in der
Datenbank, wenn sie jemand von Hand ausführt — Supabase-Dashboard → SQL
Editor, `psql`, oder das Supabase-MCP-Tool. Der Stand im Repo sagt also
nichts darüber, welche Strecken die App tatsächlich zeigt.

Die INSERTs sind **nicht idempotent**: `routes` hat keinen Unique-Key auf
`name`, ein zweiter Durchlauf legt die Strecken deshalb ein zweites Mal an.
Vor dem Einspielen prüfen, was schon da ist:

```sql
select name, region, laenge_km from public.routes
 where erstellt_von is null order by name;
```

## Generiert, nicht von Hand geschrieben

Die `.sql`-Dateien sind Ausgabe von `scripts/generate-seed-sql.mjs` und
sollen nicht direkt bearbeitet werden. Der Weg von der Idee zur Zeile:

| Schritt | Skript | Ergebnis |
| --- | --- | --- |
| Geometrie (Punkt zu Punkt, entlang einer Strassennummer) | `fetch-routes.mjs` | `scripts/output/<key>.geojson` |
| Geometrie (Rundfahrt, Mapbox-Token nötig) | `fetch-loop-route.mjs` | dito |
| Geometrie (lokale Quartierrunde, ohne Zugangsdaten) | `fetch-lokale-strecken.mjs` | dito + `.tempolimits.json` |
| Höhe, Steigung, Kehren, Höhenprofil | `enrich-routes.mjs` | `<key>.stats.json` |
| Amtliche Tempolimits Kanton ZH | `enrich-zh-tempolimits.mjs` | überschreibt `<key>.tempolimits.json` |
| Seed-SQL | `generate-seed-sql.mjs <key ...>` | die Datei hier |

Die Zwischenergebnisse unter `scripts/output/` sind mitversioniert, damit
eine Datei hier ohne erneute API-Aufrufe nachvollziehbar bleibt.

`fetch-lokale-strecken.mjs` bricht ab, statt eine fragwürdige Strecke
auszugeben — bei einem zeitlich beschränkten Fahrverbot auf der Route
(OSRM wertet `*:conditional` nicht aus) und bei mehr als 100 m abseits der
Strasse (OSRM nimmt am Stadtrand gern Feldwege). Beides ist beim Bau der
Runden in `0013` tatsächlich aufgeschlagen; die Kommentare dort halten fest,
wo und warum.

## Der amtliche Datensatz endet an der Stadtgrenze

`TBAGeschZHWFS` deckt die Kantonsstrassen ab, **ohne** die Städte Zürich und
Winterthur. Für eine Runde im Stadtgebiet bleibt es deshalb bei den
OSM-Werten (`amtlich: false`), und das ist kein Fehler, sondern der
Abdeckungsbereich der Quelle.
