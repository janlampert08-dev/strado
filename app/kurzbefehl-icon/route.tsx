import { ImageResponse } from "next/og";
import { kurzbefehl, kurzbefehlGlypheUri } from "@/lib/kurzbefehle";

// 192 px: Android zeigt Verknüpfungs-Icons mit 48 dp, auf den dichtesten
// Displays also bis 192 Pixel. Kleinere Geräte rechnen herunter.
const KANTE = 192;

/**
 * Das Icon einer App-Verknüpfung (lib/kurzbefehle.ts): die Glyphe auf der
 * Akzentfläche, wie das App-Icon selbst (app/icon.tsx) — so gehören die
 * Verknüpfungen erkennbar zu Strado.
 *
 * Die Art kommt aus der Adresse und wird deshalb gegen die Tabelle geprüft,
 * wie die Masse in app/startbild/route.tsx.
 */
export async function GET(request: Request): Promise<Response> {
  const eintrag = kurzbefehl(new URL(request.url).searchParams.get("art"));
  if (!eintrag) {
    return new Response("Diese Verknüpfung gibt es nicht.", { status: 404 });
  }

  // Die Glyphe füllt die Hälfte der Kante: Android legt das Icon in einen
  // Kreis, und die Ecken der Fläche fallen weg.
  const glyphe = Math.round(KANTE * 0.5);

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
        {/* Satori rendert hier zu einem PNG, kein Browser — next/image hilft
            nicht. Siehe app/startbild/route.tsx. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={kurzbefehlGlypheUri(eintrag, "#fafafa")} width={glyphe} height={glyphe} alt={eintrag.name} />
      </div>
    ),
    {
      width: KANTE,
      height: KANTE,
      headers: {
        // Ein Tag, wie bei den übrigen Icon-Routen: die Adresse versioniert
        // den Inhalt nicht.
        "cache-control": "public, max-age=86400",
      },
    },
  );
}
