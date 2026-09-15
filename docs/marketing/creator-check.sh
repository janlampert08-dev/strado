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
#
# ---------------------------------------------------------------------
# Zwei Wege, und sie sind rechtlich nicht dasselbe
# ---------------------------------------------------------------------
# Der RSS-Teil (letztes Video, Titel) liest
# youtube.com/feeds/videos.xml — eine veröffentlichte Schnittstelle, für
# Feed-Leser gedacht. Unbedenklich.
#
# Der Zahlen-Teil (Abonnenten, Videos, Aufrufe, Land) liest dagegen
# `ytInitialData` aus dem HTML der Kanalseite und schickt dafür einen
# Browser-User-Agent mit. Das ist Scraping, und YouTubes
# Nutzungsbedingungen untersagen das automatisierte Auslesen der Website
# ausdrücklich — unabhängig davon, dass es technisch funktioniert.
#
# Das ist hier bewusst in Kauf genommen und kein Versehen: Das Skript läuft
# von Hand, für eine Handvoll Kanäle, liest ausschliesslich öffentlich
# sichtbare Angaben und meldet sich nirgends an. Wer es regelmässig oder
# über viele Kanäle laufen lassen will, nimmt stattdessen die offizielle
# YouTube Data API (`channels.list`, `part=statistics,snippet`) — die
# braucht einen Schlüssel, ist dafür regelkonform und bricht nicht, sobald
# YouTube sein HTML umbaut.
#
# Die Abonnentenzahl ist der einzige Grund für den HTML-Teil; der RSS-Teil
# allein beantwortet die wichtigere Frage (lebt der Kanal noch?).
# =====================================================================
set -uo pipefail

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# Prüft einen Kanal und gibt genau eine Ergebniszeile aus.
#   $1  Handle ohne "@" (SwissDrive4K-ch) oder vollständige Kanal-URL
# Schreibt nach stdout, gibt keinen Fehlerstatus zurück: Ein Kanal, der nicht
# abrufbar ist, soll die Liste nicht abbrechen, sondern als solcher dastehen.
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
  # Ein leeres Datum darf NIE wie "Kanal ist still" aussehen — das ist die
  # eine Angabe, wegen der es dieses Skript gibt. Scheitert der Abruf, steht
  # der HTTP-Status da, nicht ein Fragezeichen.
  local letztes="kein Kanal-Id" titel=""
  cid=$(grep -o '"externalId":"UC[^"]*"' "$f" | head -1 | sed 's/.*:"//;s/"$//')
  if [ -n "$cid" ]; then
    local r code; r=$(mktemp)
    code=$(curl -sS -L --max-time 30 -A "$UA" -w '%{http_code}' \
      "https://www.youtube.com/feeds/videos.xml?channel_id=${cid}" -o "$r" 2>/dev/null)
    if [ "$code" != "200" ]; then
      letztes="FEED HTTP ${code:-?}"
    else
      # sed -n 2p, nicht 1p: Der Atom-Feed trägt ein <published> am
      # <feed> selbst — das Erstellungsdatum des KANALS —, und erst danach
      # eines je <entry>. Das erste zu nehmen meldete für jeden Kanal sein
      # Gründungsjahr als "letztes Video".
      #
      # Belegt, nicht angenommen: Bei 16 geprüften Kanälen stimmte das
      # erste <published> auf den Tag genau mit dem Beitrittsdatum der
      # About-Seite überein (motoch 2019-02-01, KurvenradiusTV 2016-04-07,
      # SwissDrive4K 2024-09-27, …). Ein automatischer Review hat hier 1p
      # vorgeschlagen; das wäre ein Rückschritt.
      letztes=$(grep -o '<published>[^<]*' "$r" | sed -n '2p' | sed 's/<published>//' | cut -c1-10)
      titel=$(grep -o '<media:title>[^<]*' "$r" | head -1 | sed 's/<media:title>//' | cut -c1-60)
      [ -z "$letztes" ] && letztes="Feed ohne Video"
    fi
    rm -f "$r"
  fi

  printf '%s | %s | Abos: %s | Videos: %s | Aufrufe: %s | Land: %s | letztes Video: %s | "%s"\n' \
    "$h" "${name:-?}" "${subs:-?}" "${vids:-?}" "${views:-?}" "${land:-?}" "${letztes:-?}" "${titel}"
  rm -f "$f"
}

# Liest den ersten Treffer eines JSON-Felds aus einer Datei.
#   $1  Datei mit dem Kanal-HTML
#   $2  Feldname, z. B. subscriberCountText
# Bewusst grep statt eines JSON-Parsers: Die Kanalseite ist kein JSON-Dokument,
# sondern HTML mit eingebettetem ytInitialData — und die gesuchten Felder sind
# flache Zeichenketten. Leer, wenn das Feld fehlt; nie ein falscher Wert.
# (Steht nach pruefe(), wird aber erst beim Aufruf ganz unten gebraucht.)
feld() { grep -o "\"$2\":\"[^\"]*\"" "$1" | head -1 | sed 's/.*:"//;s/"$//'; }

if [ "$#" -gt 0 ]; then
  for h in "$@"; do pruefe "$h"; done
else
  # "|| [ -n "$h" ]": read liefert am Dateiende ohne abschliessenden
  # Zeilenumbruch einen Fehlerstatus, obwohl es die Zeile gelesen hat — ohne
  # das fiele der letzte Kanal still weg.
  while read -r h || [ -n "$h" ]; do [ -n "$h" ] && pruefe "$h"; done
fi
