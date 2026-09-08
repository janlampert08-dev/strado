import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import NeueStreckeForm from "@/components/NeueStreckeForm";

export default async function NeueStreckePage() {
  const user = await getCurrentUser();

  if (!user) redirect("/anmelden");

  return <NeueStreckeForm />;
}
