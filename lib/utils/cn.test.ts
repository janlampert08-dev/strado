import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("cn", () => {
  it("lässt falsche Werte weg", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  // Der Grund für tailwind-merge: die spätere Klasse gewinnt, statt dass
  // beide im Attribut stehen und das Stylesheet entscheidet.
  it("löst widersprüchliche Utilities zugunsten der späteren auf", () => {
    expect(cn("min-h-9", "min-h-11")).toBe("min-h-11");
    expect(cn("rounded-lg", "rounded-full")).toBe("rounded-full");
    expect(cn("gap-6", "gap-3")).toBe("gap-3");
    expect(cn("w-full", "w-auto")).toBe("w-auto");
    expect(cn("bg-surface", "bg-background")).toBe("bg-background");
    expect(cn("text-muted", "text-accent")).toBe("text-accent");
    expect(cn("border-border", "border-border-control")).toBe("border-border-control");
  });

  it("lässt Klassen verschiedener Eigenschaften stehen", () => {
    expect(cn("border", "border-border-control")).toBe("border border-border-control");
    expect(cn("text-base", "md:text-sm")).toBe("text-base md:text-sm");
  });

  // Ohne die Konfiguration in cn.ts hielte tailwind-merge text-display und
  // text-title für Textfarben und würfe sie neben text-muted weg.
  it("verwechselt die eigenen Schriftgrössen nicht mit Farben", () => {
    expect(cn("text-display", "text-muted")).toBe("text-display text-muted");
    expect(cn("text-title", "text-foreground")).toBe("text-title text-foreground");
    expect(cn("text-display", "text-title")).toBe("text-title");
    expect(cn("text-sm", "text-display")).toBe("text-display");
    expect(cn("text-title", "text-xs")).toBe("text-xs");
  });

  it("verwechselt die eigenen Farb-Tokens nicht untereinander mit anderen Gruppen", () => {
    expect(cn("bg-surface", "text-muted", "border-border-control")).toBe(
      "bg-surface text-muted border-border-control",
    );
    expect(cn("text-signatur-kehren", "text-sm")).toBe("text-signatur-kehren text-sm");
    expect(cn("border-l-4", "border-l-signatur-kehren")).toBe("border-l-4 border-l-signatur-kehren");
  });

  it("kennt die eigenen Schatten, Kurven und Dauern", () => {
    expect(cn("shadow-sm", "shadow-elevated")).toBe("shadow-elevated");
    expect(cn("shadow-elevated", "shadow-overlay")).toBe("shadow-overlay");
    // Eine Schattenfarbe ist eine andere Eigenschaft als der Schatten selbst.
    expect(cn("shadow-elevated", "shadow-accent/20")).toBe("shadow-elevated shadow-accent/20");
    expect(cn("ease-in", "ease-standard")).toBe("ease-standard");
    expect(cn("duration-200", "duration-fast")).toBe("duration-fast");
    expect(cn("duration-fast", "duration-base")).toBe("duration-base");
  });
});
