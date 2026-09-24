// "Strado auf den Home-Bildschirm" — was der Browser dazu anbietet und ob
// der Nutzer es schon abgelehnt hat. Nur im Browser benutzt.
//
// Chrome auf Android feuert beforeinstallprompt einmal, meist beim ersten
// Seitenaufbau — lange bevor jemand eine Fahrt gespeichert hat. Wer es nicht
// abfängt, verliert es: Chrome zeigt dann seine eigene Leiste zu einem
// beliebigen Zeitpunkt, und der eigene Knopf später hat nichts mehr, womit
// er die Installation auslösen könnte. Deshalb hält dieses Modul das
// Ereignis app-weit fest (angemeldet in ServiceWorkerRegister.tsx, das auf
// jeder Seite läuft), und der Hinweis nach der Fahrt holt es sich hier ab.
//
// iOS kennt das Ereignis nicht; dort bleibt nur die Anleitung über das
// Teilen-Menü (components/NachDerFahrt.tsx).

/** Die Teile von BeforeInstallPromptEvent, die hier gebraucht werden — der
 *  Typ steht (noch) nicht in lib.dom.d.ts. */
export interface InstallationsAngebot extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Fängt das Angebot ab, bevor React da ist. Chrome feuert
 * beforeinstallprompt oft noch während des ersten Seitenaufbaus; ein
 * Listener aus einem useEffect kommt auf einem langsamen Telefon zu spät,
 * und bei späteren Client-Navigationen feuert es nicht erneut. Das Skript
 * steht deshalb inline im <head> (app/layout.tsx, wie das Theme-Skript) und
 * legt das Ereignis auf window ab; lauscheAufInstallationsAngebot() holt es
 * dort ab.
 */
export const INSTALLATION_INIT_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__stradoInstallation=e;});`;

let angebot: InstallationsAngebot | null = null;
const zuhoerer = new Set<() => void>();

function melden() {
  for (const z of zuhoerer) z();
}

/** Einmal app-weit aufrufen. Gibt die Abmeldung zurück. */
export function lauscheAufInstallationsAngebot(): () => void {
  const beiAngebot = (event: Event) => {
    // Chromes eigene Leiste unterdrücken: der Moment dafür ist nach der
    // ersten gespeicherten Fahrt, nicht beim ersten Seitenaufruf.
    event.preventDefault();
    angebot = event as InstallationsAngebot;
    melden();
  };
  const beiInstallation = () => {
    angebot = null;
    merkeInstallationErledigt();
  };
  const frueh = (window as Window & { __stradoInstallation?: InstallationsAngebot }).__stradoInstallation;
  if (frueh && !angebot) {
    angebot = frueh;
    melden();
  }
  window.addEventListener("beforeinstallprompt", beiAngebot);
  window.addEventListener("appinstalled", beiInstallation);
  return () => {
    window.removeEventListener("beforeinstallprompt", beiAngebot);
    window.removeEventListener("appinstalled", beiInstallation);
  };
}

export function installationsAngebot(): InstallationsAngebot | null {
  return angebot;
}

/** Löst die Installation aus. true, wenn der Nutzer zugestimmt hat. */
export async function installieren(): Promise<boolean> {
  const aktuell = angebot;
  if (!aktuell) return false;
  // Ein Angebot lässt sich nur einmal zeigen — danach ist es verbraucht.
  angebot = null;
  (window as Window & { __stradoInstallation?: InstallationsAngebot }).__stradoInstallation = undefined;
  try {
    await aktuell.prompt();
    const { outcome } = await aktuell.userChoice;
    return outcome === "accepted";
  } catch {
    // prompt() wirft, wenn der Browser das Angebot inzwischen verworfen hat.
    // Kein Grund für eine Fehlerseite — der Hinweis verschwindet einfach.
    return false;
  } finally {
    // Zugestimmt oder im Dialog des Browsers abgelehnt: beides ist eine
    // Antwort, nach der nicht bei jeder Fahrt erneut gefragt wird.
    merkeInstallationErledigt();
  }
}

// "Nicht jetzt" oder installiert: in beiden Fällen nicht wieder fragen, auf
// diesem Gerät. localStorage, weil es ums Gerät geht — auf dem nächsten
// Handy ist Strado noch nicht installiert.
const ERLEDIGT = "strado:installation-erledigt";

export function installationErledigt(): boolean {
  try {
    return localStorage.getItem(ERLEDIGT) !== null;
  } catch {
    // Kein Speicher: lieber gar nicht fragen, als bei jeder Fahrt erneut.
    return true;
  }
}

export function merkeInstallationErledigt(): void {
  try {
    localStorage.setItem(ERLEDIGT, new Date().toISOString());
  } catch {
    // Nicht schreibbar — siehe oben.
  }
  melden();
}

/** Für useSyncExternalStore. */
export function abonniereInstallation(callback: () => void): () => void {
  zuhoerer.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    zuhoerer.delete(callback);
    window.removeEventListener("storage", callback);
  };
}
