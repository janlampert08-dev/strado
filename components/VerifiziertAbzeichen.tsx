import Link from "next/link";
import { ShieldIcon } from "@/components/NavIcons";
import type { DauerQuelle } from "@/types/database";

// Macht sichtbar, was 0096–0098 in der Datenbank angelegt haben: ob die Dauer
// einer Fahrt vom Server beobachtet wurde oder nur aus den Zeitstempeln des
// Geräts stammt (route_completions.dauer_quelle).
//
// Warum das überhaupt in die Oberfläche gehört: eine Spalte, die niemand
// sieht, ist keine halbe Funktion, sondern gar keine. Der ganze Wert des
// Aufwands liegt darin, dass eine Fahrt für andere nachvollziehbar wird —
// und dafür muss jemand es lesen können.
//
// Bewusst zwei Zustände und kein Weglassen im Negativfall. Eine Fahrt ohne
// Verifikation ist keine verdächtige Fahrt: dem Gerät ist unterwegs das Netz
// weggebrochen, mehr nicht. Würde das Abzeichen dort einfach fehlen, läse
// sich die Abwesenheit als Vorwurf, sobald Nutzer die Bedeutung kennen. Der
// ausdrückliche, ruhige Negativzustand nimmt dem die Spitze — und sagt
// zugleich, was fehlt.
//
// Der Text ist an AGB Ziff. 12.6 gebunden: "verifiziert" heisst dort
// ausdrücklich NICHT, dass die Anbieterin die Fahrt bestätigt hat. Diese
// Komponente darf deshalb nie "bestätigt", "geprüft" oder "echt" behaupten.

export default function VerifiziertAbzeichen({
  quelle,
  /** Ohne Link, wenn das Abzeichen selbst schon in einem Link steckt (Feed-Karte). */
  verlinkt = true,
  className = "",
}: {
  quelle: DauerQuelle;
  verlinkt?: boolean;
  className?: string;
}) {
  const verifiziert = quelle === "server";

  const inhalt = (
    <>
      <ShieldIcon
        className={`h-3.5 w-3.5 shrink-0 ${verifiziert ? "" : "opacity-60"}`}
        aria-hidden="true"
      />
      {verifiziert ? "Zeit verifiziert" : "Zeit nicht verifiziert"}
    </>
  );

  const basis =
    "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium";
  const farbe = verifiziert
    ? "bg-accent-subtle text-accent"
    : "bg-surface text-muted border border-border";

  // Der Titel trägt die Kurzfassung für alle, die nicht auf die Erklärseite
  // gehen — und für Screenreader den Grund, warum hier überhaupt etwas steht.
  const titel = verifiziert
    ? "Die Dauer stammt aus Positionsmeldungen, die während der Fahrt an den Server gingen."
    : "Die Dauer stammt aus den Zeitstempeln des Geräts. Die Fahrt zählt, ihre Zeit erscheint aber nicht in der Rangliste.";

  if (!verlinkt) {
    return (
      <span className={`${basis} ${farbe} ${className}`} title={titel}>
        {inhalt}
      </span>
    );
  }

  return (
    <Link
      href="/verifiziert"
      className={`${basis} ${farbe} ${className} transition-colors hover:opacity-80`}
      title={titel}
    >
      {inhalt}
    </Link>
  );
}
