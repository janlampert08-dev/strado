import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { JwtPayload, User } from "@supabase/supabase-js";
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

// Wer angemeldet ist — so, wie es das JWT im Sitzungs-Cookie sagt.
//
// Genau die Felder, die ein signiertes Supabase-Access-Token trägt. Was nur
// GoTrue kennt (created_at, identities, email_confirmed_at, ...), fehlt
// bewusst; wer das braucht, nimmt getFreshUser(). user_metadata und email
// sind der Stand bei Ausstellung des Tokens: ein updateUser() wird erst mit
// dem nächsten Refresh (spätestens nach der JWT-Lebensdauer) sichtbar.
export type AktuellerNutzer = Pick<
  User,
  "id" | "email" | "user_metadata" | "app_metadata" | "is_anonymous"
>;

function nutzerAusClaims(claims: JwtPayload | undefined): AktuellerNutzer | null {
  const id = claims?.sub;
  if (typeof id !== "string" || id.length === 0) return null;
  return {
    id,
    email: typeof claims?.email === "string" ? claims.email : undefined,
    user_metadata: claims?.user_metadata ?? {},
    app_metadata: claims?.app_metadata ?? {},
    is_anonymous: claims?.is_anonymous,
  };
}

// Die aktuelle Sitzung, einmal pro Request — ohne Netzwerkaufruf.
//
// supabase.auth.getClaims() prüft die Signatur des Access-Tokens lokal gegen
// den öffentlichen JWKS-Schlüssel des Projekts (asymmetrisch, ES256; der
// Schlüsselsatz liegt 10 Minuten im Modul-Cache). Vorher lief hier getUser(),
// und das ist bei @supabase/ssr ein Roundtrip zu GoTrue (/auth/v1/user) —
// zusätzlich zu dem im Proxy, also zwei hintereinander vor jedem Render.
// Abgelaufene Tokens lehnt getClaims() ab; ein fast abgelaufenes wird über
// getSession() erneuert, wie bisher. Mit einem symmetrischen (HS256-)Token
// fällt die Bibliothek von selbst auf getUser() zurück.
//
// Nie getSession() für eine Vertrauensfrage: das liest das Cookie, ohne die
// Signatur zu prüfen. getClaims() prüft sie.
//
// Der Preis: ein Token, dessen Sitzung serverseitig beendet wurde (Abmeldung
// auf einem anderen Gerät, Konto gelöscht, Sperre), bleibt bis zu seinem
// Ablauf gültig (JWT-Lebensdauer, Standard 1 h). Für Seiten reicht das —
// RLS/PostgREST prüfen ebenfalls nur das JWT. Wo es nicht reicht, sind die
// schreibenden Server Actions: Abrechnung, Konto löschen, Moderation,
// Passwort und alle anderen Mutationen rufen weiterhin selbst
// supabase.auth.getUser() auf. Und Seiten, die frische Kontodaten zeigen oder
// daran entscheiden, nehmen getFreshUser().
//
// cache() dedupliziert pro Request-Render (Proxy, Seite, getPremiumStatus(),
// <Header /> ...). Der Client selbst wird bewusst NICHT gecacht: er hängt an
// cookies(), und ein wiederverwendeter Client würde nach einem Cookie-Wechsel
// innerhalb desselben Requests auf veraltete Werte zeigen.
//
// Nicht geeignet für Server Actions, die den Auth-Zustand mitten im Ablauf
// ändern (deleteAccount ruft signInWithPassword zur Re-Authentifizierung
// auf) — dort weiterhin direkt supabase.auth.getUser() verwenden, damit die
// zweite Abfrage den neuen Zustand sieht.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<AktuellerNutzer | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return nutzerAusClaims(data?.claims);
});

// Der vollständige User, frisch von GoTrue (/auth/v1/user) — ein Roundtrip,
// dafür sieht er eine serverseitig beendete Sitzung sofort und liefert
// aktuelle Metadaten und E-Mail statt des Stands im Token. Für Seiten, bei
// denen das zählt: /einrichten (entscheidet an user_metadata, das die
// Einrichtung gerade per updateUser() geschrieben hat), Konto-Einstellungen
// (E-Mail nach einer Änderung) und Passwort ändern. Ebenfalls per cache()
// einmal pro Request.
export const getFreshUser = cache(async function getFreshUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
