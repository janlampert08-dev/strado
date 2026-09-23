import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Einrichtung from "@/components/Einrichtung";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPaesseMitStatus } from "@/lib/paesse";
import {
  EINRICHTUNG_PFAD,
  istEinrichtungErledigt,
  passVorschlaege,
  zielNachEinrichtung,
} from "@/lib/einrichtung";
import { NICHT_INDEXIEREN } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Einrichten – Strado",
  robots: NICHT_INDEXIEREN,
};

// Die Einrichtung nach der Registrierung: Fahrzeug, Pässe, fertig.
//
// Hierher führt signUp() bzw. die Bestätigung des Codes, wenn die
// Registrierung kein eigenes Ziel hatte — wer aus dem Fazit einer Gastfahrt
// kommt, geht weiterhin direkt zurück zu seiner Fahrt (die zu speichern ist
// wichtiger als alles hier), wer Premium kaufen wollte, direkt zum Kauf.
//
// Wer schon durch ist, wird weitergeschickt: die Seite soll niemand zweimal
// sehen, auch nicht über die Chronik. Der Merker liegt in den Nutzer-
// Metadaten (lib/einrichtung.ts), gilt also auf jedem Gerät.
export default async function EinrichtenPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const ziel = zielNachEinrichtung(next);

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/anmelden?next=${encodeURIComponent(EINRICHTUNG_PFAD)}`);
  }
  if (istEinrichtungErledigt(user.user_metadata)) {
    redirect(ziel);
  }

  const supabase = await createClient();
  const [fahrzeuge, paesse] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .then(({ data }) => data ?? []),
    // Fällt der Passkatalog aus, fällt nur dieser Schritt weg — die
    // Einrichtung ist kein Ort, an dem eine Fehlerseite stehen sollte.
    getPaesseMitStatus().catch(() => []),
  ]);

  const vorschlaege = passVorschlaege(
    paesse.map(({ pass, strecke, folgtMan }) => ({
      id: pass.id,
      name: pass.name,
      hoeheM: pass.hoeheM,
      hatStrecke: strecke !== null,
      folgtMan,
    })),
  );

  return (
    <Einrichtung
      hatFahrzeug={fahrzeuge.length > 0}
      paesse={vorschlaege.map(({ id, name, hoeheM, folgtMan }) => ({ id, name, hoeheM, folgtMan }))}
      ziel={ziel}
    />
  );
}
