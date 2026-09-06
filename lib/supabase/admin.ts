import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Service-Role-Client — umgeht RLS vollständig, deshalb niemals mit
// nutzergesteuerten Filtern/IDs aufrufen, ohne die Berechtigung vorher selbst
// zu prüfen. Zwei Aufrufmuster sind aktuell in Gebrauch:
//
//   a) Kein Login vorhanden, Vertrauen kommt von woanders — der
//      Stripe-Webhook-Handler (app/api/stripe/webhook/route.ts); dort hat
//      Stripe die Event-Signatur bereits verifiziert.
//   b) Login vorhanden und geprüft, aber RLS gibt bewusst nichts her —
//      lib/actions/billing.ts (stripe_customer_id/ist_premium sind seit
//      0027 nicht an authenticated vergeben) und deleteAccount in
//      lib/actions/auth.ts (GoTrue-Admin-API).
//
// Muster (b) hängt an einem Request-Pfad. Jede Query darauf muss an die aus
// getUser() stammende ID gebunden sein, nie an eine ID aus dem Request. Eine
// weitere Aufrufstelle ist Protected-Area-Arbeit (siehe AGENTS.md).
// Ersetzt die frühere
// security-definer-RPC set_premium_status (0022), deren Secret im Klartext
// in der Migration lag und deren Ausführung an anon/authenticated vergeben
// war — siehe 0023_remove_set_premium_status_rpc.sql.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
