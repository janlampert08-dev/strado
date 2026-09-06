import { describe, expect, it } from "vitest";
import { fotoPfadAusUrl } from "@/lib/storageUrls";

// fotoPfadAusUrl ist die Brücke zwischen dem, was in
// completion_photos.foto_url gespeichert ist (die frühere öffentliche URL),
// und dem Pfad, den das Signieren braucht. Liefert sie null, verschwindet
// das Foto aus der Galerie — deshalb die Randfälle hier ausdrücklich.
describe("fotoPfadAusUrl", () => {
  const basis = "https://projekt.supabase.co/storage/v1/object/public/route-photos/";

  it("schneidet den Pfad aus einer gespeicherten öffentlichen URL", () => {
    expect(fotoPfadAusUrl(`${basis}11111111-2222-3333-4444-555555555555/foto.jpg`)).toBe(
      "11111111-2222-3333-4444-555555555555/foto.jpg",
    );
  });

  it("findet den Pfad auch in einer bereits signierten URL", () => {
    const signiert =
      "https://projekt.supabase.co/storage/v1/object/sign/route-photos/abc/foto.jpg?token=xyz";
    expect(fotoPfadAusUrl(signiert)).toBe("abc/foto.jpg?token=xyz");
  });

  it("liefert null für eine URL aus einem anderen Bucket", () => {
    expect(
      fotoPfadAusUrl("https://projekt.supabase.co/storage/v1/object/public/avatars/abc/foto.jpg"),
    ).toBeNull();
  });

  it("liefert null, wenn nach dem Bucket kein Pfad mehr folgt", () => {
    expect(fotoPfadAusUrl(basis)).toBeNull();
  });

  it("liefert null für Unsinn statt zu werfen", () => {
    expect(fotoPfadAusUrl("")).toBeNull();
    expect(fotoPfadAusUrl("kein-link")).toBeNull();
  });
});
