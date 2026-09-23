import type { Metadata } from "next";
import OfflineRetryButton from "@/components/OfflineRetryButton";
import OfflineRoutesList from "@/components/OfflineRoutesList";
import StatusPage from "@/components/ui/StatusPage";
import { NICHT_INDEXIEREN } from "@/lib/seo";
import { MapPinIcon } from "@/components/NavIcons";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "Offline – Strado",
  // Der Service Worker liefert diese Seite aus, wenn das Netz fehlt. Als
  // Suchergebnis wäre sie eine Fehlermeldung ohne Anlass.
  robots: NICHT_INDEXIEREN,
};

// Statischer Fallback, den der Service Worker (public/sw.js) bei
// Navigations-Requests ohne Netzwerkverbindung ausliefert, statt der
// generischen Offline-Seite des Browsers — seit 2026-09 auch, wenn der
// Server nach 3,5 s noch nicht geantwortet hat. Deshalb nennt der Text
// beides, fehlende und zu langsame Verbindung. Bis auf OfflineRoutesList (liest
// nur bereits lokal per OfflineRouteButton.tsx gespeicherte Strecken aus
// IndexedDB, kein Netzwerkzugriff) bewusst so minimal wie möglich — keine
// Live-Daten sonst.
export default function OfflinePage() {
  return (
    <StatusPage
      marke
      eyebrow="Strado"
      title="Du bist offline"
      description="Diese Seite braucht eine Verbindung, die gerade fehlt oder zu langsam ist. Läuft gerade eine Fahrt-Aufzeichnung, ist sie lokal gesichert und geht nicht verloren."
    >
      <OfflineRetryButton />
      <div className="mt-6 flex w-full flex-col items-center gap-3">
        <SectionHeading icon={MapPinIcon}>Offline verfügbare Strecken</SectionHeading>
        <OfflineRoutesList />
      </div>
    </StatusPage>
  );
}
