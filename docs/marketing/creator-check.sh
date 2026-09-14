#!/usr/bin/env bash
# =====================================================================
# creator-check.sh — Reichweite und Aktivität eines YouTube-Kanals
#
# Warum es dieses Skript gibt: docs/marketing/instagram-kanaele-outreach.md
# muss seine Follower-Zahlen unter "Zahlen sind ungeprüft" führen, weil sie
# aus Suchergebnis-Snippets stammen. Für YouTube geht es besser — die
# Kanalseite trägt die Zahlen in `ytInitialData`, und der RSS-Feed nennt das
# Datum des letzten Videos. Beides ohne API-Schlüssel, beides nachprüfbar.
#
# Das Datum ist der eigentliche Punkt. Ein Kanal mit 11'400 Abonnenten, der
# zuletzt 2021 etwas hochgeladen hat, steht in jeder Rangliste gut da und ist
# als Partner wertlos. Diese Unterscheidung trifft keine Follower-Zahl.
#
# Aufruf:
#   ./creator-check.sh SwissDrive4K-ch KurvenradiusTV
#   echo -e "handle1\nhandle2" | ./creator-check.sh
#
# Grenzen: YouTube liefert das im Kanal hinterlegte Land, nicht das Publikum
# (Misha Charoudin ist Schweizer und meldet die Niederlande). Häufige Abrufe
# hintereinander werden gedrosselt — dann kommen leere Felder zurück, nicht
# falsche. Für TikTok und Instagram funktioniert der Weg nicht zuverlässig.
# =====================================================================
set -uo pipefail

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

pruefe() {
  local h="$1" url f cid
  case "$h" in
    http*) url="${h%/}/about" ;;
    *)     url="https://www.youtube.com/@${h}/about" ;;
  esac

  f=$(mktemp) || return 1
  curl -sS -L --max-time 40 -A "$UA" -H "Accept-Language: de-CH,de;q=0.9" "$url" -o "$f" 2>/dev/null
  if [ ! -s "$f" ]; then echo "$h | ABRUF FEHLGESCHLAGEN"; rm -f "$f"; return; fi

  local name subs vids views land
  name=$(feld "$f" pageTitle)
  subs=$(feld "$f" subscriberCountText)
  vids=$(feld "$f" videoCountText)
  views=$(feld "$f" viewCountText)
  land=$(feld "$f" country)

  # Letztes Video über den RSS-Feed. Der erste <published>-Eintrag gehört dem
  # Kanal selbst, erst der zweite dem neuesten Video — daher sed -n 2p.
  local letztes="?" titel="?"
  cid=$(grep -o '"externalId":"UC[^"]*"' "$f" | head -1 | sed 's/.*:"//;s/"$//')
  if [ -n "$cid" ]; then
    local r; r=$(mktemp)
    curl -sS -L --max-time 30 -A "$UA" \
      "https://www.youtube.com/feeds/videos.xml?channel_id=${cid}" -o "$r" 2>/dev/null
    letztes=$(grep -o '<published>[^<]*' "$r" | sed -n '2p' | sed 's/<published>//' | cut -c1-10)
    titel=$(grep -o '<media:title>[^<]*' "$r" | head -1 | sed 's/<media:title>//' | cut -c1-60)
    rm -f "$r"
  fi

  printf '%s | %s | Abos: %s | Videos: %s | Aufrufe: %s | Land: %s | letztes Video: %s | "%s"\n' \
    "$h" "${name:-?}" "${subs:-?}" "${vids:-?}" "${views:-?}" "${land:-?}" "${letztes:-?}" "${titel:-?}"
  rm -f "$f"
}

feld() { grep -o "\"$2\":\"[^\"]*\"" "$1" | head -1 | sed 's/.*:"//;s/"$//'; }

if [ "$#" -gt 0 ]; then
  for h in "$@"; do pruefe "$h"; done
else
  while read -r h; do [ -n "$h" ] && pruefe "$h"; done
fi
