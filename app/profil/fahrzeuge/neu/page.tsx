import Header from "@/components/Header";
import NeuesFahrzeugForm from "@/components/NeuesFahrzeugForm";
import { safeInternalPath } from "@/lib/utils/url";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

// ?next steuert, wohin's nach dem Speichern zurückgeht, statt immer fest zu
// /profil. Fehlt der Parameter oder zeigt er nicht auf einen internen Pfad,
// bleibt /profil der Standard (siehe safeInternalPath).
export default async function NeuesFahrzeugPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextHref = safeInternalPath(next) ?? "/profil";

  return (
    <div className="flex h-dvh flex-col">
      <Header back={nextHref} />
      <Seitenrahmen breite="schmal" className="flex-1 justify-center">
        <NeuesFahrzeugForm nextHref={nextHref} />
      </Seitenrahmen>
    </div>
  );
}
