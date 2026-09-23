import StatusPage from "@/components/ui/StatusPage";
import Header from "@/components/Header";

// Ohne eigene Metadaten stand im Tab nur "Strado" — auf der einen Seite, die
// sagen soll, dass die Adresse nicht stimmt.
export const metadata = { title: "Seite nicht gefunden – Strado" };

// Mit Kopf und Leiste: ohne sie war eine falsche Adresse eine Sackgasse mit
// genau einem Ausweg. Die Navigation ist der gewohnte Weg zurück.

export default function NotFound() {
  return (
    // min-h-dvh liegt am Rahmen, nicht an der Statusfläche. Sonst ist die
    // Seite um die Kopfhöhe zu hoch: Kopf plus volle Ansichtshöhe ergibt
    // einen Rollbalken auf einer Seite ganz ohne Inhalt, und die zentrierte
    // Spalte sitzt sichtbar unter der Mitte. Seit cn() mit tailwind-merge
    // arbeitet, hebt die mitgegebene Klasse die eingebaute verlässlich auf.
    <div className="flex min-h-dvh flex-col">
      <Header />
      <StatusPage
        className="min-h-0 flex-1"
        marke
        title="Diese Seite gibt es nicht."
        description="Vielleicht wurde die Strecke entfernt oder der Link ist unvollständig. Alle Strecken findest du auf der Karte."
        actions={[
          { label: "Strecken ansehen", href: "/" },
          { label: "Zum Feed", href: "/feed" },
        ]}
      />
    </div>
  );
}
