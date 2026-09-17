"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Ein Eintrag der Textnavigation im Kopf (Desktop), der weiss, ob er die
 * aktuelle Seite ist.
 *
 * Die Leiste unten (BottomNav) markierte das seit jeher, der Kopf nie: auf
 * dem Desktop sah man an keiner Stelle, wo man ist, und Screenreader hörten
 * kein aria-current. Dieselbe Regel wie in BottomNav — "/" nur exakt, sonst
 * per Präfix plus aktivAuf aus lib/nav.ts.
 */
export default function HeaderNavLink({
  href,
  aktivAuf,
  ariaLabel,
  children,
}: {
  href: string;
  aktivAuf?: string[];
  ariaLabel?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const aktiv =
    href === "/"
      ? pathname === "/"
      : pathname.startsWith(href) || (aktivAuf?.some((p) => pathname.startsWith(p)) ?? false);

  return (
    <Link
      href={href}
      aria-current={aktiv ? "page" : undefined}
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 whitespace-nowrap transition-colors duration-fast hover:text-accent ${
        aktiv ? "font-medium text-accent" : "text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
