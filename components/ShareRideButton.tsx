"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { renderShareImage } from "@/lib/shareImage";
import type { GeoLineString } from "@/types/database";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Das Teilen-Bild wird erst beim Klick zusammengebaut: die Geometrie dafür
// wird bewusst nicht mit der Seite ausgeliefert, sondern hier nachgeladen.
//
// Zwei Quellen, je nach Fahrtart: eine Streckenfahrt zeichnet die
// Streckengeometrie (routes_geojson), eine freie Fahrt ihren eigenen,
// öffentlich gekappten Track (public_fahrt_tracks, siehe 0045). Für eine
// freie Fahrt, die nicht geteilt ist, gibt es keinen öffentlichen Track —
// die Fahrt-Detailseite blendet den Knopf dann aus.
export default function ShareRideButton({
  routeId,
  completionId,
  title,
  region,
  elevationM,
  distanceKm,
  durationSeconds,
  date,
  milestoneLabel = null,
  shareUrl,
}: {
  routeId: string | null;
  completionId: string;
  title: string;
  region: string | null;
  elevationM: number | null;
  distanceKm: number;
  durationSeconds: number | null;
  date: string;
  // Höchster aktuell erreichter Meilenstein des Besitzers (lib/achievements.ts),
  // vom Aufrufer nur für den eigenen Fahrten-Detailscreen mitgegeben.
  milestoneLabel?: string | null;
  // Absoluter Pfad der Seite, auf die das geteilte Bild verweisen soll
  // (z.B. /fahrten/<id>); der Host kommt vom Browser dazu.
  shareUrl: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleShare() {
    setLoading(true);
    try {
      const supabase = createClient();

      let coordinates: [number, number][] | null = null;
      let name = title;
      let regionLabel = region ?? "";
      let elevation = elevationM;

      if (routeId) {
        const { data: route } = await supabase
          .from("routes_geojson")
          .select("name, region, hoehe_m, geometry_geojson")
          .eq("id", routeId)
          .maybeSingle<{
            name: string;
            region: string;
            hoehe_m: number | null;
            geometry_geojson: GeoLineString;
          }>();

        // Ohne Geometrie gibt es kein Bild — der Knopf wird über finally
        // wieder frei, damit ein zweiter Versuch möglich bleibt.
        if (!route) {
          console.warn("ShareRideButton: keine Streckengeometrie für", routeId);
          return;
        }
        coordinates = route.geometry_geojson.coordinates;
        name = route.name;
        regionLabel = route.region;
        elevation = route.hoehe_m;
      } else {
        const { data: track } = await supabase
          .from("public_fahrt_tracks")
          .select("track_geojson")
          .eq("completion_id", completionId)
          .maybeSingle<{ track_geojson: GeoLineString }>();

        if (!track) {
          console.warn("ShareRideButton: kein öffentlicher Track für", completionId);
          return;
        }
        coordinates = track.track_geojson.coordinates;
      }

      const blob = await renderShareImage({
        routeName: name,
        region: regionLabel,
        distanceKm,
        durationSeconds,
        date,
        elevationM: elevation,
        coordinates,
        milestoneLabel,
      });

      const filename = `${slugify(name)}-${date}.jpg`;
      const url = new URL(shareUrl, window.location.origin).toString();

      // Natives Share-Sheet bevorzugt (Instagram Story/DM, WhatsApp etc. ohne
      // Umweg über den Download-Ordner) — nur wenn der Browser das für genau
      // diese Datei unterstützt (nicht überall der Fall, z.B. Desktop-Firefox).
      // navigator.canShare mit files ist erst Web-Share-API-Level-2, deshalb
      // der optionale Zugriff statt eines direkten Aufrufs.
      //
      // Der Link zur Seite soll mit, und dafür braucht es drei Stufen, weil
      // die Browser ihn unterschiedlich behandeln: Android Chrome hängt `url`
      // selbst an `text` an — steht der Link dort schon, erscheint er doppelt,
      // deshalb trägt Stufe 1 nur den Namen als Text. iOS Safari ignoriert
      // `url` neben `files` oder lehnt die Kombination in canShare ab; dort
      // muss der Link im Text stehen (Stufe 2). Bleibt beides aus, geht
      // wenigstens das Bild allein (Stufe 3, wie bisher).
      const file = new File([blob], filename, { type: "image/jpeg" });
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      const stufen: ShareData[] = [
        { files: [file], title: name, text: name, url },
        { files: [file], title: name, text: `${name} – ${url}` },
        { files: [file], title: name },
      ];
      // typeof statt Truthiness: lib.dom erklärt share für verpflichtend,
      // tatsächlich fehlt es aber z.B. in Desktop-Firefox.
      const payload =
        typeof nav.share === "function" ? stufen.find((s) => nav.canShare?.(s)) : undefined;
      if (payload) {
        try {
          await nav.share(payload);
          return;
        } catch (err) {
          // Nutzer hat den Share-Dialog abgebrochen — kein Fehler, kein
          // Download-Fallback nötig.
          if (err instanceof Error && err.name === "AbortError") return;
          // Andernfalls (z.B. Share fehlgeschlagen) auf den Download darunter
          // durchfallen.
        }
      }

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setLoading(false);
    }
  }

  // Supabase-Abfrage plus Canvas-Rendering dauern auf dem Handy leicht ein,
  // zwei Sekunden — ein blosses Ausgrauen liest sich in der Zeit wie "tot".
  // Der Spinner hat dieselbe Kantenlänge wie das Icon, der Knopf springt nicht.
  return (
    <button
      type="button"
      title="Fahrt als Bild teilen"
      aria-label="Fahrt als Bild teilen"
      aria-busy={loading}
      disabled={loading}
      onClick={handleShare}
      className="shrink-0 text-muted transition-colors duration-fast hover:text-accent disabled:opacity-50"
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
        />
      ) : (
        <Share2 className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
