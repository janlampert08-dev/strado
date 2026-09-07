import { ImageResponse } from "next/og";
import { signetDataUri } from "@/lib/marke";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Siehe app/icon.tsx — dieselbe Marke, aber in Apples empfohlener
// Touch-Icon-Grösse (180x180) und ohne eigenes Rounding (iOS maskiert
// Home-Bildschirm-Icons selbst).
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
        <img src={signetDataUri("#fafafa")} width={106} height={106} alt="Strado" />
      </div>
    ),
    { ...size },
  );
}
