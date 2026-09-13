"use server";

import { createClient } from "@/lib/supabase/server";
import { pruefeFeedback } from "@/lib/feedback";

export interface FeedbackState {
  error: string | null;
  success?: boolean;
}

// Bewusst ohne den App-seitigen isRateLimited-Vorabcheck, den
// reports.ts/ratings.ts vor ihrem Insert führen: der liest die letzte eigene
// Zeile, und genau das darf hier niemand. Die Select-Policy aus
// 0083_feedback.sql zeigt Feedback nur Moderatoren — für alle anderen käme
// die Abfrage leer zurück (RLS filtert, ohne einen Fehler zu melden), und
// isRateLimited läse daraus "noch nie geschrieben". Der Check wäre also für
// fast jeden Aufrufer ein stiller No-op plus eine Abfrage.
//
// Durchgesetzt wird der Cooldown deshalb allein vom Trigger derselben
// Migration, der als security definer ohnehin die verlässlichere Instanz ist
// (und der einzige Weg, der auch parallele Einsendungen erwischt). Die
// Meldung unten ist die, die der Nutzer in beiden Fällen sieht.
const COOLDOWN_MELDUNG =
  "Danke — bitte warte eine Minute, bevor du uns das Nächste schickst.";

// Einsenden einer Rückmeldung aus den Einstellungen
// (components/FeedbackDialog.tsx). Geschrieben wird mit dem
// request-gebundenen Client, also als der angemeldete Nutzer und unter RLS:
// die Insert-Policy aus 0083 bindet die Zeile an auth.uid(), die
// Spalten-Grants derselben Migration lassen nur user_id, kategorie und
// nachricht überhaupt zu.
//
// user_id wird trotzdem hier gesetzt und stammt aus getUser(), nicht aus
// dem Formular: die Policy verlangt Gleichheit mit auth.uid(), ein Wert von
// aussen könnte also höchstens den eigenen Insert scheitern lassen — aber
// die Spalte ist not null, irgendjemand muss sie füllen.
export async function sendFeedback(
  _prevState: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Bitte melde dich zuerst an." };

  const geprueft = pruefeFeedback(formData.get("kategorie"), formData.get("nachricht"));
  if (!geprueft.ok) return { error: geprueft.error };

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    kategorie: geprueft.kategorie,
    nachricht: geprueft.nachricht,
  });

  if (error) {
    // Der Cooldown-Trigger aus 0083 wirft 'cooldown_active' — derselbe
    // Umgang wie in completions.ts/ratings.ts/routes.ts, hier aber der
    // einzige Weg, auf dem der Cooldown überhaupt beim Nutzer ankommt
    // (siehe oben).
    if (error.message.includes("cooldown_active")) {
      return { error: COOLDOWN_MELDUNG };
    }
    // Der Grund bleibt im Serverlog, statt in einer Meldung an den Nutzer zu
    // landen: er könnte den Aufbau der Tabelle und ihrer Beschränkungen
    // verraten, und anfangen kann niemand etwas damit.
    console.error("Feedback konnte nicht gespeichert werden", { userId: user.id }, error);
    return { error: "Das hat nicht geklappt. Bitte versuch es noch einmal." };
  }

  // Kein revalidatePath: die Einstellungsseite zeigt keine Liste des eigenen
  // Feedbacks, und /moderation ist für den Absender ohnehin nicht sichtbar
  // (und lädt bei jedem Aufruf frisch).
  return { error: null, success: true };
}
