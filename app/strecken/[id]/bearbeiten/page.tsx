import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import EditRouteForm from "@/components/EditRouteForm";
import { getRoute } from "@/lib/routes";
import { isModerator } from "@/lib/moderation";
import { updateRoute, updateRouteAsModerator } from "@/lib/actions/routes";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function EditRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const route = await getRoute(id);
  if (!route) notFound();

  const user = await getCurrentUser();

  const moderator = user ? await isModerator(user.id) : false;
  const isOwnPending = user?.id === route.erstellt_von && !route.status_ok;

  if (!user || !(moderator || isOwnPending)) {
    redirect(`/strecken/${id}`);
  }

  return (
    <div className="flex h-dvh flex-col overflow-y-auto">
      <Header back={`/strecken/${id}`} />
      <EditRouteForm
        route={route}
        action={isOwnPending ? updateRoute : updateRouteAsModerator}
        adminMode={!isOwnPending}
      />
    </div>
  );
}
