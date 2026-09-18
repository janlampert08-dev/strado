import StatusPage from "@/components/ui/StatusPage";
import Header from "@/components/Header";

// Ohne eigene Metadaten stand im Tab nur "Strado" — auf der einen Seite, die
// sagen soll, dass die Adresse nicht stimmt.
export const metadata = { title: "Seite nicht gefunden – Strado" };

// Mit Kopf und Leiste: ohne sie war eine falsche Adresse eine Sackgasse mit
// genau einem Ausweg. Die Navigation ist der gewohnte Weg zurück.

export default function NotFound() {
  return (
    <>
      <Header />
      <StatusPage
        marke
        title="Seite nicht gefunden."
        description="Diese Strecke oder Seite existiert nicht (mehr)."
        actions={[
          { label: "Strecken ansehen", href: "/" },
          { label: "Zum Feed", href: "/feed" },
        ]}
      />
    </>
  );
}
