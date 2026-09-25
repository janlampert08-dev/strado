import { ImageResponse } from "next/og";
import { getPass } from "@/lib/paesse";
import { kantoneText } from "@/lib/passSeite";
import { WORTMARKE, wortmarkeDataUri } from "@/lib/marke";

export const alt = "Pass auf Strado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Freigabebild eines Passes: Name, Höhe, Kantone — und bewusst kein Status.
 *
 * Ein Vorschaubild wird von Messengern und sozialen Netzen zwischengespeichert,
 * oft über Tage. "Offen" im Bild stünde dann noch im Chat, wenn der Pass
 * längst zu ist; der Status gehört auf die Seite, wo er mit Quelle und Alter
 * steht. Gleicher Aufbau wie das Bild der Streckenseite
 * (app/strecken/[id]/opengraph-image.tsx), aus denselben Gründen inline
 * gestylt und mit der Wortmarke als Bild.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pass = await getPass(id).catch(() => null);

  if (!pass) {
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
          }}
        >
          <img
            src={wortmarkeDataUri("#131316")}
            width={Math.round(84 * WORTMARKE.seitenverhaeltnis)}
            height={84}
            alt="Strado"
          />
        </div>
      ),
      { ...size },
    );
  }

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
        <img
          src={wortmarkeDataUri("#3d5afe")}
          width={Math.round(34 * WORTMARKE.seitenverhaeltnis)}
          height={34}
          alt="Strado"
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 80, fontWeight: 600, color: "#131316" }}>
            {pass.name}
          </div>
          <div style={{ display: "flex", fontSize: 40, color: "#131316" }}>
            {`${pass.hoeheM.toLocaleString("de-CH")} m ü. M.`}
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#8a8f98" }}>
            {`${kantoneText(pass.kantone)} · Passstatus auf Strado`}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
