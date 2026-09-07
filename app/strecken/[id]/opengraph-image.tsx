import { ImageResponse } from "next/og";
import { getRoute } from "@/lib/routes";

export const alt = "Strecke auf Strado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Nutzt dieselbe (React cache()-memoisierte) getRoute() wie
// generateMetadata und die Page selbst — siehe lib/routes.ts. Fällt bei
// fehlender/ungültiger Route auf eine generische Marken-Karte zurück,
// statt die Bildgenerierung scheitern zu lassen (notFound() ist hier keine
// Option, das ist kein Page-Response). Satori/ImageResponse versteht kein
// Tailwind — deshalb zwangsläufig inline styles statt Klassennamen.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const route = await getRoute(id).catch(() => null);

  if (!route) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fafafa",
            fontSize: 88,
            fontWeight: 600,
            color: "#131316",
          }}
        >
          Strado
        </div>
      ),
      { ...size },
    );
  }

  const stats = [
    `${route.laenge_km.toFixed(0)} km`,
    route.hoehe_m !== null ? `${route.hoehe_m} Hm` : null,
  ].filter(Boolean);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 96,
          background: "#fafafa",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: "#3d5afe" }}>
          STRADO
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 600, color: "#131316" }}>
            {route.name}
          </div>
          <div style={{ display: "flex", fontSize: 36, color: "#8a8f98" }}>
            {route.region} · {route.start_ort} → {route.ziel_ort}
          </div>
          {stats.length > 0 && (
            <div style={{ display: "flex", gap: 24, fontSize: 32, color: "#131316" }}>
              {stats.join("  ·  ")}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
