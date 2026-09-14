"use client";

import StatusPage from "@/components/ui/StatusPage";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <StatusPage
      marke
      title="Etwas ist schiefgelaufen."
      description="Die Daten konnten nicht geladen werden. Bitte versuche es erneut."
      actions={[
        { label: "Erneut versuchen", onClick: reset },
        { label: "Zur Übersicht", href: "/", variant: "secondary" },
      ]}
    />
  );
}
