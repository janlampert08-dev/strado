import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll wird aus einer Server Component aufgerufen.
            // Kann ignoriert werden, wenn Middleware Sessions refresht.
          }
        },
      },
    },
  );
}

// Die aktuelle Sitzung, einmal pro Request.
//
// supabase.auth.getUser() ist bei @supabase/ssr KEIN Cookie-Parse, sondern
// ein Netzwerkaufruf gegen GoTrue (/auth/v1/user) — die Bibliothek prüft das
// Token beim Auth-Server, statt der Signatur im Cookie zu glauben. Genau
// deshalb verlangt AGENTS.md getUser() statt getSession(); der Preis ist ein
// Roundtrip pro Aufruf.
//
// Auf /strecken/[id] fiel der bisher viermal an: proxy.ts, die Seite selbst,
// getPremiumStatus() und <Header />. cache() dedupliziert das auf einen
// Aufruf pro Request-Render.
//
// Der Client selbst wird bewusst NICHT gecacht: er hängt an cookies(), und
// ein wiederverwendeter Client würde nach einem Cookie-Wechsel innerhalb
// desselben Requests auf veraltete Werte zeigen.
//
// Nicht geeignet für Server Actions, die den Auth-Zustand mitten im Ablauf
// ändern (deleteAccount ruft signInWithPassword zur Re-Authentifizierung
// auf) — dort weiterhin direkt supabase.auth.getUser() verwenden, damit die
// zweite Abfrage den neuen Zustand sieht.
export const getCurrentUser = cache(async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
