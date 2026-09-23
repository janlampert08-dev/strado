// Welche externen Anmelde-Anbieter die Anmelde- und Registrierseite
// anbieten. Gesteuert über NEXT_PUBLIC_OAUTH_ANBIETER (kommagetrennt,
// z.B. "google") — absichtlich kein fester Code-Pfad pro Anbieter, damit
// ein Anbieter im Dashboard abgeschaltet werden kann, ohne dass ein toter
// Knopf stehen bleibt.
//
// NEXT_PUBLIC heisst Build-Zeit: ändern + neu deployen, sonst sieht die
// Seite nichts davon (derselbe Freeze wie bei NEXT_PUBLIC_SITE_URL,
// siehe AGENTS.md). Dashboard-Seite dazu: Supabase → Authentication →
// Sign In / Up → Provider aktivieren, Client-ID/Secret hinterlegen und die
// Redirect-URLs (app.strado.ch UND staging.strado.ch + /auth/callback)
// erlauben — ohne den Eintrag antwortet der Start mit "provider disabled".
//
// Reine Funktion ohne Server-Import, damit Vitest sie prüfen kann und die
// Pages sie ohne Bundle-Risiko lesen.

// Heute genau einer. Apple folgt erst mit eigenem Developer-Konto — der
// Typ wächst dann um "apple", die Buttons folgen demselben Muster
// (components/GoogleLoginButton.tsx).
export type OAuthAnbieter = "google";

const BEKANNTE_ANBIETER: OAuthAnbieter[] = ["google"];

export function aktiveOAuthAnbieter(roh: string | undefined = process.env.NEXT_PUBLIC_OAUTH_ANBIETER): OAuthAnbieter[] {
  const gesehen = new Set<OAuthAnbieter>();
  for (const teil of (roh ?? "").split(",")) {
    const wert = teil.trim().toLowerCase();
    if ((BEKANNTE_ANBIETER as string[]).includes(wert)) {
      gesehen.add(wert as OAuthAnbieter);
    }
  }
  return [...gesehen];
}
