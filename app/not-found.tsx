import StatusPage from "@/components/ui/StatusPage";

export default function NotFound() {
  return (
    <StatusPage
      marke
      title="Seite nicht gefunden."
      description="Diese Strecke oder Seite existiert nicht (mehr)."
      actions={[{ label: "Zur Übersicht", href: "/" }]}
    />
  );
}
