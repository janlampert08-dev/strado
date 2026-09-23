import type { InputHTMLAttributes } from "react";

interface SwitchProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

// iOS-artiger Toggle statt einer nativen Checkbox-Optik — technisch aber
// weiterhin eine echte <input type="checkbox">, nur visuell versteckt
// (peer) und über eine gestylte <span> dargestellt. So bleibt die
// Formular-Semantik (name/value/defaultChecked, unkontrolliert per
// FormData ausgelesen) exakt die einer Checkbox, nur die Optik ändert sich.
export default function Switch({ label, description, className, ...props }: SwitchProps) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-3 py-3 ${className ?? ""}`}>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-foreground">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        aria-hidden="true"
        className="relative h-6 w-10 shrink-0 rounded-full bg-border-control transition-colors duration-fast after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-background after:shadow-sm after:transition-transform after:duration-fast peer-checked:bg-accent peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
      />
    </label>
  );
}
