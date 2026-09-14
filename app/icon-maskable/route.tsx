import { ImageResponse } from "next/og";
import { SIGNET, signetDataUri } from "@/lib/marke";

// Android beschneidet ein Icon mit purpose "maskable" auf die Form, die das
// Gerät gerade benutzt — Kreis, Squircle, Tropfen. Verlässlich sichtbar ist
// nur der innere Kreis mit 80 % der Kantenlänge; alles darüber hinaus kann
// weg sein. Die Marke bleibt deshalb hier deutlich kleiner als auf der
// normalen Kachel (app/icon.tsx, 70 %): bei 46 % Breite liegen ihre Ränder
// 23 % von der Mitte entfernt und damit mit Abstand innerhalb der 40 %, die
// die Sicherheitszone erlaubt. Die Fläche selbst läuft randlos bis an die
// Kante, damit der Beschnitt nie Weiss freilegt.
const SICHERE_BREITE = 0.46;

export const size = { width: 512, height: 512 };

/**
 * Das maskierbare App-Icon für Android.
 *
 * Ohne einen Eintrag mit purpose "maskable" schrumpft Android das normale
 * Icon in einen Kreis und legt Weiss darunter: die Kachel erscheint klein
 * mit sichtbaren Ecken. Das fiel mit dem alten, fast quadratisch gefüllten
 * "s" wenig auf und trifft den flachen Rundkurs deutlich härter.
 *
 * Eigene Route statt einer zweiten Metadaten-Datei, weil app/manifest.ts sie
 * unter einem sprechenden Namen einträgt und nicht unter "/icon1".
 */
export async function GET(): Promise<Response> {
  const markeBreite = Math.round(size.width * SICHERE_BREITE);
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
      ...size,
      headers: {
        // Siehe app/startbild/route.tsx: ein Tag, weil die Adresse den
        // Inhalt nicht versioniert.
        "cache-control": "public, max-age=86400",
      },
    },
  );
}
