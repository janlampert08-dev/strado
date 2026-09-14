import { ImageResponse } from "next/og";
import { SIGNET, signetDataUri } from "@/lib/marke";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Breite des Zeichens auf der Kachel: 70 % der Kante. Die Höhe folgt über
// das Seitenverhältnis, sonst staucht Satori den Rundkurs auf ein Quadrat.
// Beim früheren "s" war die Höhe das Maß (300 von 512) — bei einem Zeichen,
// das fast doppelt so breit wie hoch ist, ist es die Breite.
const MARKE_BREITE = Math.round(size.width * 0.7);
const MARKE_HOEHE = Math.round(MARKE_BREITE / SIGNET.seitenverhaeltnis);

/**
 * Das App-Icon: das Signet, freigestellt auf der Akzentfläche.
 *
 * Dieselbe Kontur wie in components/Wortmarke.tsx (siehe lib/marke.ts), hier
 * als <img> mit data:-URI statt als Inline-SVG, weil Satori Pfade darüber
 * zuverlässig rastert. Kein eigenes borderRadius — Browser und
 * Betriebssysteme maskieren Icons selbst (v.a. relevant für apple-icon.tsx,
 * wo iOS sonst doppelt rundet).
 */
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
        <img src={signetDataUri("#fafafa")} width={MARKE_BREITE} height={MARKE_HOEHE} alt="Strado" />
      </div>
    ),
    { ...size },
  );
}
