import Skeleton from "@/components/ui/Skeleton";
import { HeaderSkeleton } from "@/components/ui/PageSkeleton";
import Seitenrahmen from "@/components/ui/Seitenrahmen";

// Eigenes Skelett, obwohl nebenan schon eines liegt: app/registrieren/loading.tsx
// gilt in Next.js auch für dieses verschachtelte Segment, und es zeichnet das
// Registrierungsformular — drei Felder plus Rechtstext-Hinweis. Hier steht
// aber ein Feld, und darunter ein zweiter Knopf. Das Skelett versprach also
// eine andere Seite als die, die gleich kommt.
//
// Vor der Umstellung auf den Code fiel das nicht auf: die Bestätigungsseite
// war eine reine Textseite und wurde vorgerendert, ein Ladezustand kam gar
// nicht vor. Seit sie das Cookie liest (lib/bestaetigung.ts), ist sie
// dynamisch — und das falsche Skelett erscheint tatsächlich.
//
// Geometrie wie die Seite daneben, samt Begründung dort.
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <HeaderSkeleton />
      <div className="flex-1 overflow-y-auto">
        <Seitenrahmen breite="schmal" className="min-h-full justify-center">
          {/* Überschrift, der Satz mit der angedeuteten Adresse (zwei
              Zeilen), das Codefeld mit Beschriftung, der Knopf, und darunter
              der zweite für den neuen Code. */}
          <Skeleton className="h-9 w-48 rounded-md" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 rounded-sm" />
            <Skeleton className="h-4 w-2/3 rounded-sm" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
          <Skeleton className="h-10 w-48 rounded-lg" />
        </Seitenrahmen>
      </div>
    </div>
  );
}
