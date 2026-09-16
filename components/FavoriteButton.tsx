"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toggleFavorite } from "@/lib/actions/favorites";
import IconButton from "@/components/ui/IconButton";

export default function FavoriteButton({
  routeId,
  initialFavorite,
}: {
  routeId: string;
  initialFavorite: boolean;
}) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setFavorite((f) => !f);
    startTransition(async () => {
      const { ok } = await toggleFavorite(routeId);
      if (!ok) setFavorite((f) => !f);
    });
  }

  // Vorher "★ Gemerkt" / "☆ Merken" — die Sterne waren TEXTZEICHEN. Was die
  // Plattformschrift daraus macht, ist auf jedem Gerät anders breit, hoch und
  // schwer, und neben den SVG-Icons der übrigen Schaltflächen sah dieselbe
  // Zeile auf zwei Telefonen verschieden aus.
  //
  // Jetzt ein Icon aus demselben Satz wie alles andere, in einer 44-px-Fläche.
  // Der Text wandert ins aria-label und ins title — die Beschriftung "Merken"
  // erklärte einem Stern ohnehin nichts, was der Stern nicht selbst sagt.
  return (
    <IconButton
      onClick={handleClick}
      disabled={pending}
      ton={favorite ? "aktiv" : "neutral"}
      title={favorite ? "Gemerkt — antippen zum Entfernen" : "Strecke merken"}
      aria-label={favorite ? "Aus den Favoriten entfernen" : "Zu den Favoriten hinzufügen"}
      aria-pressed={favorite}
    >
      <Star
        className={`h-5 w-5 ${favorite ? "fill-current" : ""}`}
        aria-hidden="true"
      />
    </IconButton>
  );
}
