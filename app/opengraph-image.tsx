import { ImageResponse } from "next/og";

export const alt = "Strado — Kuratierte Fahrstrecken für Auto und Motorrad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Standard-Freigabebild für Seiten ohne eigenes opengraph-image.tsx (z.B.
// Startseite, Bestenlisten). Strecken haben ein spezifischeres Pendant
// unter app/strecken/[id]/opengraph-image.tsx. Satori/ImageResponse
// versteht kein Tailwind — deshalb zwangsläufig inline styles statt
// Klassennamen, keine Stilinkonsistenz zum Rest der Codebase.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 24,
          padding: 96,
          background: "#fafafa",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#3d5afe",
            color: "#fafafa",
            fontSize: 36,
            fontWeight: 600,
          }}
        >
          S
        </div>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 600, color: "#131316" }}>
          Strado
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#8a8f98" }}>
          Kuratierte Fahrstrecken für Auto und Motorrad
        </div>
      </div>
    ),
    { ...size },
  );
}
