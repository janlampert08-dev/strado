import { describe, expect, it } from "vitest";
import { OG_GEERBT, ogMitBild } from "@/lib/openGraph";

describe("OG_GEERBT", () => {
  // Der eigentliche Regressionsschutz: diese drei Felder sind genau die, die
  // ein seiteneigener openGraph-Block sonst still mit entfernt.
  it("führt Bild, Sitename und Locale mit", () => {
    expect(OG_GEERBT.siteName).toBe("Strado");
    expect(OG_GEERBT.locale).toBe("de_CH");
    expect(OG_GEERBT.images).toHaveLength(1);
    expect(OG_GEERBT.images[0].url).toBe("/opengraph-image");
  });

  it("nennt die Bildmasse, weil sie ohne dateibasiertes Bild niemand ergänzt", () => {
    expect(OG_GEERBT.images[0]).toMatchObject({ width: 1200, height: 630 });
  });

  it("enthält keine description — die gehört an die Aufrufstelle", () => {
    expect(OG_GEERBT).not.toHaveProperty("description");
  });
});

describe("ogMitBild", () => {
  it("ersetzt nur das Bild und behält den Rest", () => {
    const og = ogMitBild("/strecken/abc/opengraph-image", "Albis Loop auf Strado");
    expect(og.images).toEqual([
      { url: "/strecken/abc/opengraph-image", width: 1200, height: 630, alt: "Albis Loop auf Strado" },
    ]);
    expect(og.siteName).toBe("Strado");
    expect(og.locale).toBe("de_CH");
  });
});
