import StatusPage from "@/components/ui/StatusPage";
import Header from "@/components/Header";

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
