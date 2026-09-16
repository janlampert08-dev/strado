// Meldungen zu den ?fehler=-Parametern, mit denen app/auth/callback/route.ts
// eine gescheiterte Link-Einlösung zurückgibt.
//
// WARUM ES DAS BRAUCHT
//
// Der Callback leitete bei jedem Fehlschlag auf /anmelden?fehler=bestaetigung
// um — und niemand las den Parameter. Wer auf einem abgelaufenen, schon
// verwendeten oder im falschen Browser geöffneten Link landete, bekam also
// ein kommentarloses Anmeldeformular und keinen Hinweis darauf, was zu tun
// ist. Beim Passwort-Zurücksetzen ist das der schlechtestmögliche Ausgang:
// die Person kennt ihr Passwort nicht, die Anmeldung hilft ihr nicht weiter,
// und nichts auf dem Schirm sagt ihr, dass sie einen neuen Link anfordern
// soll.
//
// Hier statt in der Seite, weil zwei Seiten dasselbe brauchen (/anmelden und
// /anmelden/passwort-vergessen) und weil die Zuordnung damit prüfbar ist:
// Vitest läuft in diesem Projekt nur über lib/ (AGENTS.md).
//
// Feste Zuordnung statt durchgereichtem Text: der Wert kommt aus der
// Adresszeile und ist damit beliebig setzbar. Ein unbekannter Wert ergibt
// null und damit gar keine Meldung — so kann niemand über einen
// präparierten Link eine eigene Aussage auf unserer Anmeldeseite platzieren
// ("Ihr Konto wurde gesperrt, rufen Sie …").

/** Bestätigungs-/Anmeldelink liess sich nicht einlösen. */
export const FEHLER_BESTAETIGUNG = "bestaetigung";

/** Zurücksetzen-Link liess sich nicht einlösen. */
export const FEHLER_LINK = "link";

const MELDUNGEN: Record<string, string> = {
  [FEHLER_BESTAETIGUNG]:
    "Dieser Link hat nicht funktioniert — er ist abgelaufen, wurde schon verwendet oder in einem anderen Browser geöffnet als dem, aus dem er angefordert wurde. Bitte melde dich an oder fordere einen neuen Link an.",
  // Ohne den Browser-Hinweis wäre die Meldung irreführend: der Link wird per
  // PKCE eingelöst, und der dafür nötige Prüfwert liegt als Cookie in genau
  // dem Browser, aus dem die Anfrage kam. Wer die E-Mail auf dem Handy
  // öffnet, nachdem er den Link am Rechner angefordert hat, kommt deshalb
  // hier heraus, obwohl mit dem Link selbst alles in Ordnung ist.
  [FEHLER_LINK]:
    "Der Link zum Zurücksetzen hat nicht funktioniert — er ist abgelaufen, wurde schon verwendet oder in einem anderen Browser geöffnet als dem, aus dem er angefordert wurde. Fordere hier einen neuen an und öffne ihn im selben Browser.",
};

export function authFehlerText(
  roh: string | string[] | undefined | null,
): string | null {
  // searchParams liefert bei doppeltem Parameter ein Array — dann gilt keine
  // der beiden Angaben, statt sich für eine zu entscheiden.
  if (typeof roh !== "string") return null;
  return MELDUNGEN[roh] ?? null;
}
