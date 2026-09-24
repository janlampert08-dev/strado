import { headers } from "next/headers";
import { siteUrl } from "@/lib/siteUrl";

// Hosts, denen ein aus dem Request gelesener Host für E-Mail-Links
// (emailRedirectTo / redirectTo) vertraut wird. Alles andere fällt auf
// siteUrl() zurück — ein per X-Forwarded-Host eingeschleuster Angreifer-Host
// landet damit nie in einer Auth-Mail an ein Opfer.
const VERTRAUENSWUERDIGE_HOSTS = new Set([
  "app.strado.ch",
  "staging.strado.ch",
  "strado.ch",
  "www.strado.ch",
]);

function istVertrauenswuerdigerHost(host: string | null): host is string {
  if (!host) return false;
  const sauber = host.trim().toLowerCase().split(":")[0];
  if (VERTRAUENSWUERDIGE_HOSTS.has(sauber)) return true;
  if (sauber === "localhost" || sauber === "127.0.0.1") return true;
  return false;
}

// Ermittelt die aktuelle Origin für E-Mail-Links. Der Host kommt aus dem
// Request, wird aber gegen die Allowlist oben geprüft — sonst siteUrl() als
// Fail-closed. Protokoll: https ausser lokal.
export async function getOrigin(): Promise<string> {
  const fallback = siteUrl();
  try {
    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
    if (!istVertrauenswuerdigerHost(host)) return fallback;
    const sauber = host.trim().toLowerCase().split(":")[0];
    const lokal = sauber === "localhost" || sauber === "127.0.0.1";
    const proto = headerList.get("x-forwarded-proto") ?? (lokal ? "http" : "https");
    if (proto !== "https" && !lokal) return fallback;
    return `${lokal ? "http" : "https"}://${sauber}`;
  } catch {
    return fallback;
  }
}

// Validiert einen aus einem ?next=-Query-Parameter oder Formularfeld
// stammenden Rücksprungpfad (z. B. app/profil/fahrzeuge/neu/page.tsx aus dem
// Onboarding oder die Anmeldung, siehe signIn in lib/actions/auth.ts), bevor
// er als redirect()-Ziel verwendet wird — muss ein interner, mit "/"
// beginnender Pfad sein und darf nicht mit "//" oder "/\" beginnen (beides
// vom Browser als protokollrelative externe URL interpretiert, z. B.
// "//evil.example"). Andernfalls null, der Aufrufer fällt dann auf einen
// festen Default-Pfad zurück. Verhindert einen Open-Redirect über einen
// manipulierten next-Wert.
//
// Nimmt FormDataEntryValue mit entgegen, weil formData.get() auch ein File
// liefern kann, wenn ein Client ein Feld dieses Namens als Datei sendet —
// ohne die typeof-Prüfung würde .startsWith() darauf werfen, bei der
// Anmeldung also direkt nach erfolgreicher Passworteingabe.
//
// Steuerzeichen werden vorab komplett abgewiesen und nicht etwa entfernt:
// Der URL-Parser (Browser wie Node) streicht Tab, CR und LF aus einer URL,
// BEVOR er sie zerlegt. Eine Prüfung, die nur die ersten beiden Zeichen
// ansieht, lässt "/\t/evil.example" deshalb durch — daraus wird beim
// Auflösen "//evil.example" und damit genau die protokollrelative externe
// URL, die zwei Zeilen tiefer abgewiesen wird. Verwerfen statt bereinigen,
// weil ein Pfad mit Steuerzeichen ohnehin kein legitimer Rücksprung ist und
// jede Normalisierung nur eine neue Umgehung einlädt.
export function safeInternalPath(
  raw: FormDataEntryValue | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  if (!raw) return null;
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}
