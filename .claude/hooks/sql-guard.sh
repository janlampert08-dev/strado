#!/usr/bin/env bash
#
# PreToolUse-Hook (matcher: Bash)
#
# Erzwingt einen Permission-Prompt, sobald ein Shell-Kommando SQL gegen eine
# Datenbank ausfuehrt. Ergaenzung zu den permissions.ask-Regeln in
# .claude/settings.json: Permission-Regeln matchen nur den Anfang des
# Kommandos, dieser Hook durchsucht das gesamte Kommando. Damit wird auch
#   echo "DROP TABLE routen;" | psql "$DATABASE_URL"
# erfasst, das an "Bash(psql *)" vorbeilaeuft.
#
# Ausgabe bei Treffer: permissionDecision "ask" -> Claude Code fragt nach.
# Kein Treffer: keine Ausgabe, normale Permission-Pruefung greift.

set -uo pipefail

input=$(cat)

if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')
else
  # Ohne jq lieber zu viel pruefen als zu wenig: gesamtes Payload durchsuchen.
  cmd=$input
fi

[ -z "$cmd" ] && exit 0

# SQL-Ausfuehrungsvektoren dieses Projekts (Postgres / Supabase CLI).
# Die Client-Binaries werden nur in Kommando-Position erkannt (Zeilenanfang
# oder nach | ; & ( ` $( ), optional hinter Wrappern wie sudo/npx. So loest
# das Wort "psql" in einer Commit-Message keinen Prompt aus.
wrappers='((sudo|env|time|npx|bunx|pnpm|yarn|dlx)[[:space:]]+([^[:space:]|;&(]+[[:space:]]+){0,4})*'
position="(^|[|;&(\`]|\\$\\()[[:space:]]*${wrappers}"
clients='(psql|pg_dump|pg_restore)'

client_pattern="${position}${clients}([[:space:]]|$)"
# Supabase-CLI: dieselbe Kommando-Position-Logik. "supabase functions list"
# bleibt unberuehrt, "supabase db push" spielt gegen Produktion ein.
db_pattern="${position}supabase[[:space:]]+db([[:space:]]|$)"
migration_pattern="${position}supabase[[:space:]]+migration([[:space:]]|$)"
# Ausnahmen: "supabase migration new" legt nur eine Datei unter
# supabase/migrations/ an, "supabase migration list" liest das Ledger. Beides
# aendert nichts an der Datenbank und braucht daher keine Bestaetigung.
# Bewusst als Ausnahmeliste, nicht als Positivliste der gefaehrlichen
# Subkommandos: repair, up, squash, fetch -- und alles kuenftig dazukommende --
# bleiben so automatisch bestaetigungspflichtig.
migration_exempt="${position}supabase[[:space:]]+migration[[:space:]]+(new|list)([[:space:]]|$)"

needs_ask=0

if printf '%s' "$cmd" | grep -Eqi "$client_pattern" || printf '%s' "$cmd" | grep -Eqi "$db_pattern"; then
  needs_ask=1
else
  # Ein Kommando kann mehrere "supabase migration"-Aufrufe verketten. Sobald
  # mehr Aufrufe gefunden werden als ausgenommene, ist mindestens einer davon
  # bestaetigungspflichtig.
  total=$(printf '%s' "$cmd" | grep -oEi "$migration_pattern" | grep -c '')
  exempt=$(printf '%s' "$cmd" | grep -oEi "$migration_exempt" | grep -c '')
  [ "$total" -gt "$exempt" ] && needs_ask=1
fi

if [ "$needs_ask" -eq 1 ]; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"SQL-Ausfuehrung erkannt. Projektregel: SQL-Befehle immer vorher bestaetigen lassen."}}'
fi

exit 0
