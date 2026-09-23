import { ImageResponse } from "next/og";
import { SIGNET, signetDataUri } from "@/lib/marke";

// Zwei Grössen, weil Chrome für die Installierbarkeit ein 192er- und ein
// 512er-Icon erwartet; bis 2026-09 gab es nur 512 und Android rechnete für
// Launcher und Einstellungen herunter. Mit generateImageMetadata liegen sie
// unter /icon/192 und /icon/512 (app/manifest.ts nennt beide).
const GROESSEN = [192, 512] as const;

export const contentType = "image/png";

export function generateImageMetadata() {
  return GROESSEN.map((kante) => ({
    id: String(kante),
    size: { width: kante, height: kante },
    contentType,
  }));
}

/**
 * Das App-Icon: das Signet, freigestellt auf der Akzentfläche.
 *
 * Dieselbe Kontur wie in components/Wortmarke.tsx (siehe lib/marke.ts), hier
 * als <img> mit data:-URI statt als Inline-SVG, weil Satori Pfade darüber
 * zuverlässig rastert. Kein eigenes borderRadius — Browser und
 * Betriebssysteme maskieren Icons selbst (v.a. relevant für apple-icon.tsx,
 * wo iOS sonst doppelt rundet).
 */
export default async function Icon({ id }: { id: Promise<string | number> }) {
  const angefragt = Number(await id);
  const kante = GROESSEN.find((g) => g === angefragt) ?? 512;

  // Breite des Zeichens auf der Kachel: 70 % der Kante. Die Höhe folgt über
  // das Seitenverhältnis, sonst staucht Satori den Rundkurs auf ein Quadrat.
  // Beim früheren "s" war die Höhe das Mass (300 von 512) — bei einem
  // Zeichen, das fast doppelt so breit wie hoch ist, ist es die Breite.
  const markeBreite = Math.round(kante * 0.7);
  const markeHoehe = Math.round(markeBreite / SIGNET.seitenverhaeltnis);

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
        <img src={signetDataUri("#fafafa")} width={markeBreite} height={markeHoehe} alt="Strado" />
      </div>
    ),
    { width: kante, height: kante },
  );
}
