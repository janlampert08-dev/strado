import { headers } from "next/headers";

// Ermittelt die aktuelle Origin aus den Request-Headern, damit
// E-Mail-Bestätigungslinks in jeder Umgebung (localhost, Vercel-Preview,
// Produktion) auf die richtige Domain zeigen, ohne sie fest zu verdrahten.
export async function getOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
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
