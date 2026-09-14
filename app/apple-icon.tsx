import { ImageResponse } from "next/og";
import { SIGNET, signetDataUri } from "@/lib/marke";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Gleicher Anteil der Kante wie in app/icon.tsx, damit beide Icons dasselbe
// Zeichen in derselben Grösse zeigen.
const MARKE_BREITE = Math.round(size.width * 0.7);
const MARKE_HOEHE = Math.round(MARKE_BREITE / SIGNET.seitenverhaeltnis);

/**
 * Das Touch-Icon für iOS.
 *
 * Siehe app/icon.tsx — dieselbe Marke, aber in Apples empfohlener Grösse
 * (180x180) und ohne eigenes Rounding, weil iOS Home-Bildschirm-Icons selbst
 * maskiert.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#3d5afe",
        }}
      >
        <img src={signetDataUri("#fafafa")} width={MARKE_BREITE} height={MARKE_HOEHE} alt="Strado" />
      </div>
    ),
    { ...size },
  );
}
