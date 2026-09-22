// Der Promo-Code fuer das Signup-Link-Angebot (0121).
//
// Derselbe Wert steht als Zeile in premium_promo_codes — driftet
// beides auseinander, zeigt das Moderations-Panel einen toten Link.
// Deshalb hier an einer Stelle, und die Migration nimmt ihn nicht
// als Prozessvariable sondern als SQL-Insert.
export const PROMO_CODE = "7-tage-gratis";

// Die URL, die Moderatoren kopieren und verteilen koennen.
//
// Die Basis kommt von siteUrl() und nicht vom Host der Anfrage:
// sonst zeigte ein von staging.strado.ch kopierter Link auf Staging,
// und dort kommt ausser Moderators niemand hinein (proxy.ts).
export function promoSignupUrl(basis: string): string {
  return `${basis.replace(/\/+$/, "")}/registrieren?promo=${PROMO_CODE}`;
}
