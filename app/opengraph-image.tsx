import { ImageResponse } from "next/og";
import { WORTMARKE, wortmarkeDataUri } from "@/lib/marke";

export const alt = "Strado — Kuratierte Fahrstrecken für Auto und Motorrad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Standard-Freigabebild für Seiten ohne eigenes opengraph-image.tsx (z.B.
// Startseite, Bestenlisten). Strecken haben ein spezifischeres Pendant
// unter app/strecken/[id]/opengraph-image.tsx. Satori/ImageResponse
// versteht kein Tailwind — deshalb zwangsläufig inline styles statt
// Klassennamen, keine Stilinkonsistenz zum Rest der Codebase.
//
// Die Wortmarke kommt als Kontur aus lib/marke.ts. Als Text gesetzt
// bräuchte Satori die Schriftdatei mitgeliefert — und die Marke stünde
// dann in einer Schrift, die die App sonst nirgends lädt.
const MARKE_HOEHE = 84;

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
          gap: 40,
          padding: 96,
          background: "#fafafa",
        }}
      >
        <img
          src={wortmarkeDataUri("#131316")}
          width={Math.round(MARKE_HOEHE * WORTMARKE.seitenverhaeltnis)}
          height={MARKE_HOEHE}
          alt="Strado"
        />
        <div style={{ display: "flex", fontSize: 36, color: "#8a8f98" }}>
          Kuratierte Fahrstrecken für Auto und Motorrad
        </div>
      </div>
    ),
    { ...size },
  );
}
