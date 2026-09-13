import { FEEDBACK_KATEGORIEN } from "@/lib/constants";

export type FeedbackKategorie = (typeof FEEDBACK_KATEGORIEN)[number]["value"];

// Dieselben Grenzen wie die CHECK-Beschränkung in 0083_feedback.sql. Die
// Datenbank setzt sie durch, hier stehen sie, damit ein zu kurzer oder zu
// langer Text als Hinweis im Formular ankommt statt als Datenbankfehler.
//
// Die Untergrenze ist bewusst niedrig: sie soll ein versehentlich
// abgeschicktes leeres oder einsilbiges Formular abfangen, nicht darüber
// urteilen, wie ausführlich eine Rückmeldung zu sein hat.
export const FEEDBACK_MIN_LENGTH = 10;
export const FEEDBACK_MAX_LENGTH = 2000;

export type FeedbackPruefung =
  | { ok: true; kategorie: FeedbackKategorie; nachricht: string }
  | { ok: false; error: string };

export function istFeedbackKategorie(value: unknown): value is FeedbackKategorie {
  return FEEDBACK_KATEGORIEN.some((k) => k.value === value);
}

// Prüft die Eingaben des Feedback-Formulars und liefert den fertig
// bereinigten Datensatz oder die Meldung, die im Formular erscheint.
//
// Bewusst hier in lib/ statt in der Server Action: Vitest läuft mit
// environment "node" und alle Tests liegen in lib/ (siehe AGENTS.md) — eine
// Prüfung, die in der Action selbst steckt, wäre ungetestet. Die Action
// bleibt damit auf Authentifizierung, Cooldown und Schreibzugriff
// beschränkt.
//
// Getrimmt wird vor der Längenprüfung, sonst brächte eine Nachricht aus
// 2000 Leerzeichen die Obergrenze zu Fall und eine aus zehn Leerzeichen die
// Untergrenze. Der Rückgabewert ist der getrimmte Text: geschrieben wird
// genau das Geprüfte, nicht die Rohfassung daneben.
export function pruefeFeedback(kategorie: unknown, nachricht: unknown): FeedbackPruefung {
  if (!istFeedbackKategorie(kategorie)) {
    return { ok: false, error: "Bitte wähle aus, worum es geht." };
  }

  const text = typeof nachricht === "string" ? nachricht.trim() : "";

  if (text.length < FEEDBACK_MIN_LENGTH) {
    return {
      ok: false,
      error: `Bitte schreib uns mindestens ${FEEDBACK_MIN_LENGTH} Zeichen — sonst können wir wenig damit anfangen.`,
    };
  }

  // Nicht stillschweigend abschneiden (anders als der Meldungs-Kommentar in
  // lib/actions/reports.ts, der optionales Beiwerk ist): hier ist der Text
  // die ganze Einsendung. Wer 2100 Zeichen tippt, soll die letzten 100 nicht
  // unbemerkt verlieren.
  if (text.length > FEEDBACK_MAX_LENGTH) {
    return {
      ok: false,
      error: `Das sind ${text.length} Zeichen — bitte kürze auf höchstens ${FEEDBACK_MAX_LENGTH}.`,
    };
  }

  return { ok: true, kategorie, nachricht: text };
}
