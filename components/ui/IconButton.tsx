import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils/cn";

// Die eine Icon-Schaltfläche der App. Vorher zeichnete jede Stelle ihre
// eigene: Teilen, Melden, Sichtbarkeit und das Melden eines Kommentars
// standen als blankes 16- bzw. 14-px-Icon ohne Innenabstand da, drei davon
// mit gap-3 nebeneinander in der Kopfzeile der Fahrtseite. WCAG 2.2
// SC 2.5.8 verlangt 24 px, Apple und Android nennen 44 px bzw. 48 dp —
// und das hier ist eine App, die im Fahrzeug bedient wird.
//
// 44 px ist deshalb keine Empfehlung, sondern der Mindestwert: min-h-11 und
// min-w-11 stehen fest in `basis`.
//
// Was dieser Kommentar bis zur Review von PR #254 behauptete — "Tailwind
// würde eine zweite min-h-* zwar gewinnen lassen" — stimmt nicht, und der
// Satz hätte den Nächsten in die Irre geführt: lib/utils/cn.ts ist ein
// reiner String-Join und kein tailwind-merge. Stehen zwei Utilities
// derselben Eigenschaft im class-Attribut, entscheidet die Reihenfolge im
// erzeugten CSS und nicht die im Attribut — welche gewinnt, hängt also
// davon ab, wie Tailwind sortiert, und nicht davon, wer sie zuletzt
// hinschreibt. Ein Unterbieten über className ist damit weder verlässlich
// möglich noch verlässlich verhindert. Wer eine andere Grösse braucht,
// bekommt einen Parameter (so wie chipClassName einen hat), statt sie
// anzuhängen.
//
// Der sichtbare Rahmen im Ruhezustand ist Absicht: ein Icon ohne Fläche
// liest sich wie ein Textzeichen, das versehentlich in eine Kopfzeile
// geraten ist. Mit Fläche liest sich dieselbe Zeile als Schaltflächen.
const basis =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full " +
  "transition-[transform,opacity,border-color,background-color,color] duration-fast ease-standard " +
  "active:scale-95 disabled:pointer-events-none disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export type IconButtonTon = "neutral" | "aktiv" | "gefahr" | "leise";

const toene: Record<IconButtonTon, string> = {
  neutral: "border border-border text-muted hover:border-muted hover:text-foreground",
  aktiv: "border border-accent bg-accent-subtle text-accent",
  // Erst bei Hover rot: eine Melden-Schaltfläche, die dauerhaft rot
  // leuchtet, behauptet einen Missstand, den es noch gar nicht gibt.
  gefahr: "border border-border text-muted hover:border-danger hover:text-danger",
  // Ohne Rahmen, für eine Handlung, die da sein muss, aber nicht neben den
  // eigentlichen stehen soll — "Fahrt melden" stand mit demselben Rahmen und
  // derselben Grösse neben "Teilen" und las sich als gleichrangig. Rot erst
  // beim Hovern, wie bei "gefahr".
  leise: "text-muted hover:bg-surface hover:text-danger",
};

export function iconButtonVariants({
  ton = "neutral",
  className,
}: { ton?: IconButtonTon; className?: string } = {}): string {
  return cn(basis, toene[ton], className);
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ton?: IconButtonTon;
  /** Pflicht: die Schaltfläche trägt nur ein Icon, der Text muss woanders her. */
  "aria-label": string;
  // React 19 reicht ref als gewöhnliche Prop an Funktionskomponenten durch —
  // forwardRef ist dafür nicht mehr nötig. Deklariert werden muss sie
  // trotzdem, weil ButtonHTMLAttributes sie nicht mitbringt. Gebraucht wird
  // sie von den Menü-Auslösern, die den Fokus nach dem Schliessen
  // zurückholen (RouteActionsMenu, CompletionActionsMenu).
  ref?: Ref<HTMLButtonElement>;
}

export default function IconButton({ ton = "neutral", className, ...props }: IconButtonProps) {
  return <button type="button" className={iconButtonVariants({ ton, className })} {...props} />;
}
