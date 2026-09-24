import { listRoutesForApi } from "@/lib/routes";
import { getPaesseMitStatus } from "@/lib/paesse";
import { getOeffentlichesAngebot } from "@/lib/actions/billing";
import { betragText, planTitel, planZeitraum } from "@/lib/premiumAngebot";
import { siteUrl } from "@/lib/siteUrl";
import type { AboPlan } from "@/lib/premiumLimits";
import { streckenPfad } from "@/lib/streckenPfad";

// Maschinenlesbare Kurzbeschreibung für KI-Assistenten und Antwortmaschinen
// (ChatGPT, Perplexity, Gemini & Co.): was Strado ist, welche öffentlichen
// Seiten und Daten es gibt, und wo die tagesaktuellen Fakten stehen.
//
// Keine neue indexierbare Content-Seite — text/plain, kein HTML, keine
// Sitemap-Aufnahme. Inhaltliche Regeln wie für strukturierte Daten:
// - Preise kommen aus Stripe (getOeffentlichesAngebot), nie aus einer
//   zweiten Liste im Code.
// - Der Passstatus ist volatil (5-Minuten-Feed): hier stehen nur der
//   Katalog und der Verweis auf /paesse, kein Stand.
// - Fällt eine Quelle aus, entfällt ihr Abschnitt — die Datei antwortet
//   trotzdem mit 200 und dem statischen Kern.
const REIHENFOLGE: AboPlan[] = ["jahr", "saisonpass", "monat"];

export async function GET() {
  const origin = siteUrl();

  const [strecken, paesse, plaene] = await Promise.all([
    listRoutesForApi(false).catch(() => []),
    getPaesseMitStatus().catch(() => []),
    getOeffentlichesAngebot().catch(() => []),
  ]);

  const sortiert = REIHENFOLGE.map((plan) => plaene.find((p) => p.plan === plan)).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  );

  const zeilen: string[] = [
    "# Strado",
    "",
    "> Handverlesene Pass-, Kurven- und Aussichtsstrecken in der ganzen Schweiz.",
    "> Fahrten per GPS aufzeichnen, vergleichen, teilen. Sprache: Deutsch (de-CH).",
    "",
    `- Web-App: ${origin}/`,
    `- Info-Seite: https://www.strado.ch/`,
    `- Kontakt: contact@strado.ch`,
    "",
    "## Öffentliche Seiten",
    "",
    `- Strecken entdecken: ${origin}/`,
    `- Passstatus (tagesaktuell): ${origin}/paesse`,
    `- Ranglisten: ${origin}/ranglisten`,
    `- Premium-Übersicht: ${origin}/premium`,
    `- Was „verifizierte Zeiten" bedeutet: ${origin}/verifiziert`,
    "",
  ];

  if (strecken.length > 0) {
    zeilen.push("## Strecken (freigegeben, Stand dieser Antwort)", "");
    for (const s of strecken) {
      const orte = s.ist_rundfahrt
        ? `Start/Ziel: ${s.start_ort}`
        : `${s.start_ort} → ${s.ziel_ort}`;
      zeilen.push(
        `- ${s.name} — ${s.region}: ${orte}, ${s.laenge_km.toFixed(1)} km: ${origin}${streckenPfad(s)}`,
      );
    }
    zeilen.push("");
  }

  if (paesse.length > 0) {
    zeilen.push(
      "## Pässe (Katalog — der tagesaktuelle Status steht unter /paesse, nicht hier)",
      "",
    );
    for (const { pass } of paesse) {
      zeilen.push(`- ${pass.name} (${pass.hoeheM.toLocaleString("de-CH")} m, ${pass.kantone.join("/")})`);
    }
    zeilen.push("");
  }

  if (sortiert.length > 0) {
    zeilen.push("## Premium", "");
    for (const p of sortiert) {
      zeilen.push(
        `- ${planTitel(p.plan)}: ${betragText(p.betragRappen, p.waehrung)} ${planZeitraum(p.plan)}`,
      );
    }
    zeilen.push(
      "",
      `Entdecken, Aufzeichnen, Ranglisten, Feed und Passstatus bleiben gratis. Details: ${origin}/premium`,
      "",
    );
  }

  zeilen.push(
    "## Öffentliche API (ohne Schlüssel, nur per IP begrenzt)",
    "",
    `- GET ${origin}/api/strecken — alle freigegebenen Strecken als JSON`,
    `- GET ${origin}/api/strecken?hoehenprofil=1 — zusätzlich mit Höhenprofil je Strecke`,
    `- GET ${origin}/api/strecken/{id} — eine Strecke im Detail`,
    `- GET ${origin}/api/strecken/{id}/leaderboard — Bestzeiten dieser Strecke`,
    "",
    "## Rechtliches",
    "",
    "- Impressum: https://strado.ch/legal/impressum",
    "- Datenschutz: https://strado.ch/legal/datenschutz",
    "- AGB: https://strado.ch/legal/agb",
    "",
  );

  return new Response(zeilen.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Selten ändernd, oft gelesen: 1 h am CDN, 10 min stale im Browser.
      // Der Passstatus steht bewusst nicht drin, also lügt kein Cache.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
