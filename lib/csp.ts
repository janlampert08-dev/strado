// Die Content-Security-Policy der Anwendung. Ausgeliefert von
// next.config.ts → headers(); hier steht sie, damit sie eine Testdatei
// bekommen kann. next.config.ts wird von Vitest nicht geladen, und eine
// Policy ohne Test ist genau die Sorte Konfiguration, die lautlos falsch
// wird: ein fehlender Fremd-Host fällt erst auf, wenn jemand im Browser
// vor einem kaputten Formular sitzt.
//
// Die Policy ist scharf (nicht Report-Only) und gilt auch im Dev-Modus —
// damit ein Verstoss vor dem Deploy auffällt und nicht erst danach.
//
// Bleibende Schwäche, bewusst und benannt: script-src trägt weiterhin
// 'unsafe-inline' und 'unsafe-eval'. Next injiziert Inline-Skripte, und der
// saubere Ersatz sind Nonces — die verlangen, dass die CSP pro Anfrage in
// der Middleware (proxy.ts) erzeugt wird, was jede Seite dynamisch macht.
// Das ist ein eigener Umbau. Bis dahin schützt script-src nur gegen fremde
// Skript-Origins, nicht gegen eingeschleustes Inline-Skript; alle übrigen
// Direktiven wirken davon unabhängig.

// Stripe.js, vollständig nach der offiziellen Liste in
// https://docs.stripe.com/security/guide#content-security-policy.
//
// Zwei Punkte daraus standen bis 2026-09-08 nicht hier und haben den
// Live-Kauf gekostet:
//
// 1. *.js.stripe.com in script-src. Stripe.js startet Frames und lädt
//    Teilskripte von wechselnden Unter-Origins; js.stripe.com allein deckt
//    das nicht ab.
// 2. link.com / *.link.com. Link ist im Payment Element aktiv (das
//    Anmelde-Feld "Meine Daten speichern für eine schnellere
//    Kaufabwicklung" gehört dazu), und Links Oberfläche wie auch seine
//    Aufrufe laufen über Stripe-eigene link.com-Hosts, nicht über
//    *.stripe.com. Ohne die Freigabe warf checkout.confirm() eine
//    Ausnahme statt ein Ergebnis zu liefern — im Formular als "Die Zahlung
//    liess sich gerade nicht bestätigen" sichtbar, und sonst nirgendwo,
//    weil ein CSP-Verstoss nur in der Browser-Konsole landet.
//
// Die Wildcards über Stripes eigene Domains sind Absicht: welchen
// Unter-Host Stripe für eine Zahlungsart wählt, ist deren Sache und ändert
// sich, ein übersehener Endpunkt bricht sonst wieder lautlos die
// Bezahlseite. link.com gehört laut derselben Dokumentation Stripe.
const STRIPE_SCRIPT = ["https://js.stripe.com", "https://*.js.stripe.com"];
const STRIPE_FRAME = [
  "https://*.stripe.com",
  // Betrugserkennung; eigene Domain, von *.stripe.com nicht abgedeckt.
  "https://m.stripe.network",
  "https://link.com",
  "https://*.link.com",
];
const STRIPE_CONNECT = [
  "https://*.stripe.com",
  "https://m.stripe.network",
  "https://link.com",
  "https://*.link.com",
];
const STRIPE_IMG = ["https://*.stripe.com", "https://*.link.com"];

/**
 * Baut die Policy als Header-Wert.
 *
 * @param istEntwicklung Im Dev-Modus zusätzlich erlaubt: Turbopacks
 *   HMR-Websocket und das Debug-Skript von @vercel/analytics. Beides gibt es
 *   in Produktion nicht, und beides würde die scharfe Policy sonst lokal
 *   brechen — was den einzigen Ort entwertet, an dem ein Verstoss vor dem
 *   Deploy auffällt.
 */
export function contentSecurityPolicy(istEntwicklung: boolean): string {
  const dev = (...quellen: string[]) => (istEntwicklung ? quellen : []);

  // Herleitung der Fremd-Origins je Direktive:
  //
  // - Mapbox GL (components/RouteMap.tsx) kommt aus dem Bundle, nicht von
  //   einer CDN, holt Style/Sprites/Glyphen/Kacheln von api.mapbox.com, meldet
  //   Nutzung an events.mapbox.com (beides *.mapbox.com) und erzeugt seine
  //   Worker aus Blobs — daher worker-src blob:. child-src steht als Fallback
  //   für Browser ohne worker-src daneben.
  // - Stripe (components/PremiumCheckoutForm.tsx): siehe die Konstanten oben.
  // - Supabase: REST/Auth/Storage über *.supabase.co, Bilder ebenso (signierte
  //   Storage-URLs, lib/storageUrls.ts). Kein Realtime im Einsatz, deshalb
  //   kein wss:.
  // - api.open-meteo.com: Wetter auf der Streckenseite.
  // - Nicht in der Liste, weil serverseitig geholt und damit nie vom Browser:
  //   api3.geo.admin.ch (lib/elevation.ts) sowie overpass-api.de und
  //   maps.zh.ch (scripts/, laufen unter Node).
  // - @vercel/analytics lädt in Produktion /_vercel/insights/script.js von der
  //   eigenen Origin; nur im Dev-Modus kommt das Debug-Skript von
  //   va.vercel-scripts.com.
  return [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      ...STRIPE_SCRIPT,
      ...dev("https://va.vercel-scripts.com"),
    ],
    ["worker-src", "'self'", "blob:"],
    ["child-src", "'self'", "blob:"],
    ["style-src", "'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    ["font-src", "'self'", "data:", "https://fonts.gstatic.com"],
    ["img-src", "'self'", "data:", "blob:", "https://*.supabase.co", "https://*.mapbox.com", ...STRIPE_IMG],
    [
      "connect-src",
      "'self'",
      "https://*.supabase.co",
      "https://*.mapbox.com",
      "https://api.open-meteo.com",
      // Das Payment Element bekommt seine Schrift als CSS-Datei mitgegeben
      // (FONTS in components/PremiumCheckoutForm.tsx). Stripe verlangt
      // dafür ausdrücklich connect-src auf die Adresse dieser Datei —
      // style-src deckt das nicht ab, weil das Stylesheet nicht von unserer
      // Seite, sondern vom Element geladen wird.
      "https://fonts.googleapis.com",
      ...STRIPE_CONNECT,
      ...dev("ws:"),
    ],
    ["frame-src", ...STRIPE_FRAME],
    ["frame-ancestors", "'none'"],
    ["base-uri", "'self'"],
    // Zwei Formulare der App führen auf eine fremde Adresse, beide zu
    // Stripe:
    //
    // 1. <form action={createPortalSession}> in components/PremiumCard.tsx
    //    legt eine Portal-Sitzung an und leitet auf deren URL weiter
    //    (billing.stripe.com, lib/actions/billing.ts). Mit Javascript ist
    //    das eine Navigation und form-action gar nicht zuständig; ohne
    //    Javascript wird daraus ein echter Formular-POST mit Weiterleitung,
    //    und den blockieren Firefox und Safari unter form-action 'self'.
    //
    // 2. checkout.confirm() für eine Weiterleitungs-Zahlungsart, also für
    //    TWINT — die für ein Schweizer Produkt wichtigste. Stripe.js schickt
    //    dafür ein Formular an einen eigenen Zwischenhost (hooks. bzw.
    //    checkout.stripe.com), von dem aus es weiter zur Bank geht. Genau
    //    dieser erste Sprung stand hier nicht in der Liste: unter
    //    form-action 'self' https://billing.stripe.com blockierte Safari
    //    ihn stillschweigend, das Bezahl-Formular blieb auf "Wird
    //    verarbeitet…" stehen, und im Log war nichts zu sehen, weil der
    //    Verstoss nur in der Browser-Konsole landet.
    //
    // Deshalb die Wildcard über Stripes eigene Domains statt einer
    // Aufzählung einzelner Hosts — dieselbe Begründung wie oben bei
    // connect-src und frame-src: welchen Zwischenhost Stripe für eine
    // Zahlungsart wählt, ist deren Sache und kann sich ändern. Nur der
    // erste Sprung braucht die Erlaubnis; danach gilt die CSP der
    // Stripe-Seite, nicht mehr unsere. link.com steht mit dabei, weil eine
    // Zahlung über Link genauso über einen Link-eigenen Host einsteigt.
    ["form-action", "'self'", "https://*.stripe.com", "https://link.com", "https://*.link.com"],
    ["object-src", "'none'"],
  ]
    .map((direktive) => direktive.join(" "))
    .join("; ");
}
