import type { Metadata } from "next";
import OfflineRetryButton from "@/components/OfflineRetryButton";
import OfflineRoutesList from "@/components/OfflineRoutesList";
import StatusPage from "@/components/ui/StatusPage";
import { NICHT_INDEXIEREN } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Offline – Strado",
  // Der Service Worker liefert diese Seite aus, wenn das Netz fehlt. Als
  // Suchergebnis wäre sie eine Fehlermeldung ohne Anlass.
  robots: NICHT_INDEXIEREN,
};

// Statischer Fallback, den der Service Worker (public/sw.js) bei
// Navigations-Requests ohne Netzwerkverbindung ausliefert, statt der
// generischen Offline-Seite des Browsers. Bis auf OfflineRoutesList (liest
// nur bereits lokal per OfflineRouteButton.tsx gespeicherte Strecken aus
// IndexedDB, kein Netzwerkzugriff) bewusst so minimal wie möglich — keine
// Live-Daten sonst.
export default function OfflinePage() {
  return (
    <StatusPage
      marke
      eyebrow="Strado"
      title="Du bist offline"
      description="Diese Seite braucht eine Verbindung, die gerade nicht besteht. Läuft gerade eine Fahrt-Aufzeichnung, ist sie lokal gesichert und geht nicht verloren."
    >
      <OfflineRetryButton />
      <div className="mt-6 flex w-full flex-col items-center gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
          Offline verfügbare Strecken
        </h2>
        <OfflineRoutesList />
      </div>
    </StatusPage>
  );
}
