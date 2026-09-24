// Versionierung des Service Workers (public/sw.js) pro Build.
//
// public/sw.js ist eine statische Datei. Solange sich ihre Bytes nicht
// ändern, installiert der Browser sie nie neu, und ihr Cache-Name blieb bis
// 2026-09 fest "cornice-shell-v1" — jeder Deploy liess seine Chunks für immer
// im Cache liegen. Statt die Datei bei jedem Build umzuschreiben (ein
// generiertes File in public/, das lokal den Arbeitsbaum verschmutzt) hängt
// die Registrierung die Build-Kennung als Query an: eine neue Skript-URL
// reicht dem Browser für eine Neuinstallation, und sw.js liest die Kennung
// aus self.location und benennt seine Caches danach.

type Umgebung = Record<string, string | undefined>;

/**
 * Die Kennung des laufenden Builds. Läuft in next.config.ts, also einmal pro
 * `next build`, und wird über `env` in den Client-Bundle eingesetzt.
 *
 * Vercel-Deployment-ID vor Commit-SHA: ein erneuter Deploy desselben Commits
 * (Redeploy, geänderte Umgebungsvariable) ist ein neuer Build mit
 * möglicherweise anderen Chunks und soll ebenfalls frisch installieren.
 * Lokal gibt es beides nicht; dann tut es die Uhrzeit des Builds.
 */
export function buildKennung(umgebung: Umgebung, jetzt: number): string {
  const kennung = umgebung.VERCEL_DEPLOYMENT_ID || umgebung.VERCEL_GIT_COMMIT_SHA;
  if (kennung) return kennung;
  return `lokal-${jetzt.toString(36)}`;
}

/**
 * Die URL, unter der die App den Service Worker registriert. Ohne Kennung
 * (sollte nicht vorkommen, next.config.ts setzt immer eine) bleibt es bei
 * /sw.js — der Worker läuft dann mit einem festen Cache-Namen wie früher,
 * statt gar nicht.
 */
export function serviceWorkerUrl(kennung: string | undefined): string {
  if (!kennung) return "/sw.js";
  return `/sw.js?v=${encodeURIComponent(kennung)}`;
}
