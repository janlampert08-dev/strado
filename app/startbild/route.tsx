import { ImageResponse } from "next/og";
import { SIGNET, signetDataUri } from "@/lib/marke";
import { istErlaubteStartbildGroesse } from "@/lib/startbilder";

/**
 * Das Startbild für iOS: die Marke auf der Akzentfläche, in Gerätegrösse.
 *
 * Eine Route mit Maßen in der Adresse statt einer Datei je Gerät — iOS
 * verlangt für jedes Modell ein exakt passendes Bild (siehe
 * lib/startbilder.ts), und das wären zehn fast gleiche Dateien.
 *
 * Die Maße kommen damit von aussen, also werden sie gegen die Tabelle
 * geprüft und nicht bloss auf eine Obergrenze: eine Anfrage mit
 * ?b=20000&h=20000 soll den Bildrenderer nicht beschäftigen.
 */
export async function GET(request: Request): Promise<Response> {
  const parameter = new URL(request.url).searchParams;
  const breite = Number(parameter.get("b"));
  const hoehe = Number(parameter.get("h"));

  if (!istErlaubteStartbildGroesse(breite, hoehe)) {
    return new Response("Startbild in dieser Grösse gibt es nicht.", { status: 404 });
  }

  // Die Marke nimmt 52 % der Bildbreite ein. Das ist schmaler als auf der
  // App-Kachel (70 %, app/icon.tsx): hier ist die Fläche ein ganzes
  // Telefondisplay, und ein Zeichen, das darauf genauso viel Breite belegt,
  // wirkt wie ein Fehler statt wie ein Gruss.
  const markeBreite = Math.round(breite * 0.52);
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
        {/* next/image gibt es hier nicht und braucht es nicht: das rendert
            Satori zu einem PNG, kein Browser. Die Metadaten-Dateien
            app/icon.tsx und app/apple-icon.tsx machen es genauso, dort
            greift die Regel nur nicht. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signetDataUri("#fafafa")} width={markeBreite} height={markeHoehe} alt="Strado" />
      </div>
    ),
    {
      width: breite,
      height: hoehe,
      headers: {
        // Einen Tag, nicht ein Jahr: die Adresse enthält keine Prüfsumme des
        // Inhalts, ein unsterbliches Bild würde also nach einer Änderung der
        // Marke weiter das alte Zeichen zeigen — genau die Falle, in die
        // app/favicon.ico schon einmal getappt ist.
        "cache-control": "public, max-age=86400",
      },
    },
  );
}
