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

/**
 * Die IP-Bremse im Callback hat zugeschlagen — der Link selbst ist in
 * Ordnung. Eigener Wert, weil die beiden Meldungen oben hier schlicht
 * falsch wären ("abgelaufen, schon verwendet"): wer hinter einer geteilten
 * Adresse sitzt oder dessen Mailscanner den Link vorab abruft, hat nichts
 * falsch gemacht und soll es gleich noch einmal versuchen können.
 */
export const FEHLER_ZU_VIELE = "zuviele";

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
  [FEHLER_ZU_VIELE]:
    "Von deinem Anschluss kamen gerade zu viele Anfragen. Warte einen Moment und öffne den Link dann noch einmal — er ist weiterhin gültig.",
};

export function authFehlerText(
  roh: string | string[] | undefined | null,
): string | null {
  // searchParams liefert bei doppeltem Parameter ein Array — dann gilt keine
  // der beiden Angaben, statt sich für eine zu entscheiden.
  if (typeof roh !== "string") return null;
  // Object.hasOwn statt blossem Indexzugriff: MELDUNGEN ist ein
  // Objektliteral und erbt damit von Object.prototype. MELDUNGEN["toString"]
  // liefert eine FUNKTION statt undefined, und die kommt an "?? null" vorbei,
  // weil eine Funktion nicht nullish ist. Der Wert ginge dann als Prop an
  // eine Client-Komponente, was den RSC-Render abbricht — gemessen gegen das
  // Preview-Deployment: /anmelden?fehler=toString lieferte HTTP 200 mit 32 KB
  // statt 45 KB und OHNE das Anmeldeformular. Ein Link mit diesem Parameter
  // hätte die Anmeldeseite für den Empfänger unbenutzbar gemacht.
  //
  // Dieselbe Lücke für valueOf, constructor, hasOwnProperty und __proto__;
  // lib/authFehler.test.ts hält alle fünf fest. Die feste Zuordnung oben
  // schützt gegen eingeschleusten TEXT — gegen geerbte Schlüssel nicht.
  if (!Object.hasOwn(MELDUNGEN, roh)) return null;
  return MELDUNGEN[roh];
}

