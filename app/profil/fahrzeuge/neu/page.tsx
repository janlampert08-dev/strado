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
      {/* Eigener Scrollbehälter um den zentrierten Rahmen, und min-h-full
          statt flex-1: "justify-center" in einem h-dvh-Flexcontainer
          zentriert auch dann, wenn der Inhalt höher ist als der Platz —
          und überlaufender Inhalt ist an der OBEREN Kante dann nicht mehr
          erreichbar, weil es nichts zu scrollen gibt. Auf 390 × 844 mit
          eingeblendeter Tastatur ist genau das der Fall, und dieser PR hat
          das Risiko vergrössert: der Seitenrahmen bringt 64–80 px
          senkrechte Polsterung mit, die das frühere <main> nicht hatte.
          Mit min-h-full zentriert es weiter, solange es passt, und wächst
          darüber hinaus in den Scrollbereich statt zu beschneiden. */}
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite="schmal" className="min-h-full justify-center">
          <NeuesFahrzeugForm nextHref={nextHref} />
        </Seitenrahmen>
      </div>
    </div>
  );
}
