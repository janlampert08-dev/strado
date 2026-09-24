// Erkennung der Staging-Umgebung — eine Stelle für alle, die sie brauchen:
// das Zugriffsgate in proxy.ts, der Indexierungsschutz in app/robots.ts und
// der Einstieg für Moderatoren in app/profil/einstellungen/page.tsx.
//
// Die Umgebung ist das Deployment des Branches `staging`. Produktion läuft
// von `main` unter app.strado.ch und erfüllt keine der beiden Bedingungen
// unten.

export const STAGING_BRANCH = "staging";
export const STAGING_HOSTNAME = "staging.strado.ch";
export const STAGING_URL = `https://${STAGING_HOSTNAME}`;

// Der eigentliche, verlässliche Nachweis: Vercel setzt
// VERCEL_GIT_COMMIT_REF auf den Branch, aus dem das Deployment gebaut wurde.
// Er gilt für *jede* Adresse, unter der dieses Deployment erreichbar ist —
// die Custom-Domain, die Branch-Adresse (…-git-staging-….vercel.app) und
// jede einzelne Deployment-URL (…-<hash>-….vercel.app).
//
// Genau das war die Lücke der ersten Fassung des Gates: sie prüfte allein
// den Hostnamen staging.strado.ch. Vercel vergibt daneben aber immer auch
// die Branch- und die Deployment-Adresse, und unter denen lag dieselbe
// Staging-App völlig ungeschützt offen — ein Link genügte.
//
// Seit 2026-09-24 zählt JEDES Vorschau-Deployment dazu (VERCEL_ENV ===
// "preview"), nicht nur das des staging-Branches. Vercel baut für jeden
// Branch mit PR eine Vorschau unter einer vorhersagbaren Adresse
// (strado-git-<branch>-jl-e520.vercel.app). Die Deployment-Protection des
// Projekts ist aus, und alle Vorschauen sprechen gegen die Produktions-DB —
// im Audit lieferte die Vorschau eines Feature-Branches ungeschützt die
// echten Strecken aus, mit "Allow: /" in robots.txt. Ungeprüfter Code
// jedes Branches (auch Dependabot) lief damit öffentlich auf Echtdaten,
// Anmeldung mit echten Konten inklusive. Dieselbe Sperre wie für Staging
// schliesst das: nur Moderatoren, und Disallow für Crawler.
//
// Produktion (main) meldet VERCEL_ENV "production", lokale Entwicklung
// setzt die Variable gar nicht — beide bleiben unberührt.
export function istStagingDeployment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.VERCEL_GIT_COMMIT_REF === STAGING_BRANCH || env.VERCEL_ENV === "preview";
}

// Der Hostname bleibt als zweite, unabhängige Bedingung stehen. Sie greift
// dort, wo die Branch-Variable nicht ankommt (eigener Betrieb, ein Proxy vor
// der App) — und sie ist die einzige, die auch dann noch stimmt, wenn jemand
// die Custom-Domain versehentlich auf ein Deployment eines anderen Branches
// legt. Beide Bedingungen sperren; keine von beiden gibt frei.
export function istStagingHostname(
  hostname: string | null | undefined,
): boolean {
  return hostname === STAGING_HOSTNAME;
}

// Kurzschluss für Aufrufer, die nur wissen wollen: gilt hier der
// Staging-Sonderfall?
export function istStaging(
  hostname: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return istStagingHostname(hostname) || istStagingDeployment(env);
}
