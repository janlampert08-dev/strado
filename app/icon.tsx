import { ImageResponse } from "next/og";
import { signetDataUri } from "@/lib/marke";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Das "s" der Wortmarke, freigestellt auf der Akzentfläche — dieselbe Kontur
// wie in components/Wortmarke.tsx (siehe lib/marke.ts). Als <img> mit
// data:-URI statt als Inline-SVG, weil Satori Pfade darüber zuverlässig
// rastert. Kein eigenes borderRadius — Browser und Betriebssysteme maskieren
// Icons selbst (v.a. relevant für apple-icon.tsx, wo iOS sonst doppelt
// rundet).
export default function Icon() {
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
        <img src={signetDataUri("#fafafa")} width={300} height={300} alt="Strado" />
      </div>
    ),
    { ...size },
  );
}
