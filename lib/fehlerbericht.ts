// Minimaler Client-Fehlerbericht ohne neue Abhängigkeit: die App hatte bis
// hierher gar keine Fehlertelemetrie (nur <Analytics /> in app/layout.tsx).
// Sendet sparsam an /api/fehler, nie mit Nutzerinhalten — nur Pfad,
// Meldung und ein gekürzter Stack. Kein Warten auf Antwort, kein Werfen.
const FEHLER_URL = "/api/fehler";
let gesendet = 0;
const MAX_PRO_SEITE = 5;

export function meldeClientFehler(fehler: unknown, kontext?: string): void {
  try {
    if (gesendet >= MAX_PRO_SEITE) return;
    if (typeof window === "undefined") return;
    gesendet += 1;
    const nachricht =
      fehler instanceof Error ? fehler.message : String(fehler).slice(0, 300);
    const stapel =
      fehler instanceof Error && typeof fehler.stack === "string"
        ? fehler.stack.slice(0, 1000)
        : undefined;
    const nutzlast = JSON.stringify({
      pfad: window.location.pathname.slice(0, 200),
      meldung: nachricht.slice(0, 300),
      stapel,
      kontext: kontext?.slice(0, 200),
    });
    if (navigator.sendBeacon) {
      const blob = new Blob([nutzlast], { type: "application/json" });
      if (navigator.sendBeacon(FEHLER_URL, blob)) return;
    }
    void fetch(FEHLER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: nutzlast,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Melden darf nie selbst fehlschlagen.
  }
}
