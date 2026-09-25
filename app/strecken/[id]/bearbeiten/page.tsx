import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import EditRouteForm from "@/components/EditRouteForm";
import { getRoute } from "@/lib/routes";
import { isModerator } from "@/lib/moderation";
import { updateRoute, updateRouteAsModerator } from "@/lib/actions/routes";
import { getCurrentUser } from "@/lib/supabase/server";
import { NICHT_INDEXIEREN } from "@/lib/seo";
import { streckenPfad } from "@/lib/streckenPfad";

// Wie /strecken/neu: bisher ohne eigenen Titel, und ein Bearbeitungsformular
// gehört in kein Suchergebnis.
export const metadata: Metadata = {
  title: "Strecke bearbeiten – Strado",
  robots: NICHT_INDEXIEREN,
};

export default async function EditRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // UUID oder Slug (0130), getRoute() nimmt beides.
  const { id } = await params;
  const route = await getRoute(id);
  if (!route) notFound();

  const user = await getCurrentUser();

  const moderator = user ? await isModerator(user.id) : false;
  const isOwnPending = user?.id === route.erstellt_von && !route.status_ok;

  if (!user || !(moderator || isOwnPending)) {
    redirect(streckenPfad(route));
  }

  return (
    <div className="flex h-dvh flex-col overflow-y-auto">
      <Header back={streckenPfad(route)} />
      <EditRouteForm
        route={route}
        action={isOwnPending ? updateRoute : updateRouteAsModerator}
        adminMode={!isOwnPending}
      />
    </div>
  );
}
