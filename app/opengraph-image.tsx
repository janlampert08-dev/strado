import { ImageResponse } from "next/og";
import { SLOGAN } from "@/lib/constants";
import { WORTMARKE, wortmarkeDataUri } from "@/lib/marke";

export const alt = `Strado — ${SLOGAN}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Höhe der Wortmarke im Bild; die Breite folgt über das Seitenverhältnis.
const MARKE_HOEHE = 84;

/**
 * Standard-Freigabebild für Seiten ohne eigenes opengraph-image.tsx, etwa
 * Startseite und Bestenlisten. Strecken haben ein spezifischeres Pendant
 * unter app/strecken/[id]/opengraph-image.tsx.
 *
 * Satori/ImageResponse versteht kein Tailwind — deshalb zwangsläufig inline
 * styles statt Klassennamen, keine Stilinkonsistenz zum Rest der Codebase.
 * Die Wortmarke kommt als Kontur aus lib/marke.ts: als Text gesetzt bräuchte
 * Satori die Schriftdatei mitgeliefert, und die Marke stünde dann in einer
 * Schrift, die die App sonst nirgends lädt.
 */
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
        <div style={{ display: "flex", fontSize: 36, color: "#8a8f98" }}>{SLOGAN}</div>
      </div>
    ),
    { ...size },
  );
}
