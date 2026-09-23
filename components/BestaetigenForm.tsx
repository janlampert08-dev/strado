"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import {
  bestaetigeRegistrierung,
  sendeBestaetigungErneut,
  type BestaetigungState,
  type ErneutSendenState,
} from "@/lib/actions/auth";
import Button, { textAktionClassName } from "@/components/ui/Button";
import useEingabenBewahren from "@/components/useEingabenBewahren";
import { cn } from "@/lib/utils/cn";

const codeStart: BestaetigungState = { error: null };
const erneutStart: ErneutSendenState = { error: null, gesendet: false };

// Obergrenze dessen, was Supabase als Code-Länge zulässt — dieselbe wie
// CODE_MAX in lib/bestaetigung.ts, das hier nicht importiert werden darf
// (siehe codeLaenge unten). Das Feld schneidet erst dort ab und nicht bei
// codeLaenge: stimmt die angezeigte Länge einmal nicht mit der Einstellung
// im Dashboard überein, soll der echte Code trotzdem ganz hineinpassen.
const HOECHSTENS = 10;

// Nach einem erneuten Versand bleibt der Knopf so lange gesperrt. Der Server
// lässt drei Versände je zehn Minuten zu; ohne Wartezeit tippt man die drei
// in fünf Sekunden weg, bevor die erste E-Mail überhaupt da ist.
const ERNEUT_SPERRE_SEKUNDEN = 60;

export default function BestaetigenForm({
  // Angedeutete Adresse (lib/bestaetigung.ts). Ohne sie wüsste niemand, in
  // welches von mehreren Postfächern er schauen soll; vollständig
  // ausgeschrieben stünde sie auf einem Bildschirm, der offen herumliegt.
  emailHinweis,
  // Als Prop und nicht als Import von CODE_LAENGE: lib/bestaetigung.ts
  // greift über safeInternalPath auf lib/utils/url.ts und damit auf
  // next/headers zu. Ein Import von hier zöge das ins Browser-Bundle und
  // bricht den Build — dieselbe Falle, die AGENTS.md für
  // lib/premiumLimits.ts beschreibt. Die Seite ist eine Server Component
  // und reicht den Wert deshalb einfach durch.
  codeLaenge,
  gueltigMinuten,
}: {
  emailHinweis: string;
  codeLaenge: number;
  gueltigMinuten: number;
}) {
  const [codeStatus, codeAbsenden, codeLaeuft] = useActionState(
    bestaetigeRegistrierung,
    codeStart,
  );

  const [sperreBis, setSperreBis] = useState<number | null>(null);
  const [erneutStatus, erneutAbsenden, erneutLaeuft] = useActionState(
    async (): Promise<ErneutSendenState> => {
      const ergebnis = await sendeBestaetigungErneut();
      if (ergebnis.gesendet) {
        setSperreBis(Date.now() + ERNEUT_SPERRE_SEKUNDEN * 1000);
      }
      return ergebnis;
    },
    erneutStart,
  );

  // Der Sekundentakt läuft nur, solange die Sperre steht.
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    if (sperreBis === null) return;
    const takt = setInterval(() => {
      const t = Date.now();
      setJetzt(t);
      if (t >= sperreBis) {
        setSperreBis(null);
        clearInterval(takt);
      }
    }, 1000);
    return () => clearInterval(takt);
  }, [sperreBis]);
  const restSekunden =
    sperreBis === null ? 0 : Math.max(0, Math.ceil((sperreBis - jetzt) / 1000));

  // Ohne das stünde das Feld nach einem falschen Code leer da — React 19
  // leert unkontrollierte Felder bei einem Formular, das über eine Action
  // zurückkommt. Hier wiegt das schwerer als anderswo: wer einen Code
  // abgetippt und sich bei einer Ziffer vertan hat, müsste alle acht neu
  // suchen. Siehe components/useEingabenBewahren.ts.
  //
  // Das Feld bleibt deshalb unkontrolliert; `ziffern` spiegelt nur, was die
  // Kästchen zeigen. Beim Zurücksetzen feuert kein input-Ereignis, der
  // Spiegel behält also den Wert, den der Haken gleich zurückschreibt.
  const formRef = useRef<HTMLFormElement>(null);
  useEingabenBewahren(formRef);

  const [ziffern, setZiffern] = useState("");
  const [fokussiert, setFokussiert] = useState(false);
  // Der zuletzt automatisch abgeschickte Code: ein falscher Code soll nicht
  // bei jedem Tippen erneut losgehen, sondern erst, wenn er sich geändert hat.
  const zuletztAbgeschickt = useRef<string | null>(null);
  // Die Antwort, nach der zuletzt getippt wurde. Sobald jemand an einem
  // abgelehnten Code korrigiert, hören die Kästchen auf, rot zu sein — die
  // Meldung darunter bleibt stehen, bis der nächste Versuch sie ersetzt.
  const [getipptNach, setGetipptNach] = useState<BestaetigungState | null>(
    null,
  );

  function beiEingabe(e: ChangeEvent<HTMLInputElement>) {
    // Aus der E-Mail kopierte Codes bringen Leerzeichen, Bindestriche oder
    // einen Zeilenumbruch mit. Statt sie abzuweisen, fliegen sie heraus —
    // der Server räumt ohnehin noch einmal auf (codeNormalisieren).
    const sauber = e.target.value.replace(/\D/g, "").slice(0, HOECHSTENS);
    if (sauber !== e.target.value) e.target.value = sauber;
    setZiffern(sauber);
    setGetipptNach(codeStatus);

    // Vollständig eingefügt oder vom Telefon aus der Mitteilung übernommen:
    // der Knopf darunter wäre dann nur noch ein Tipp ohne Entscheidung.
    if (
      sauber.length === codeLaenge &&
      sauber !== zuletztAbgeschickt.current &&
      !codeLaeuft
    ) {
      zuletztAbgeschickt.current = sauber;
      formRef.current?.requestSubmit();
    }
  }

  function caretAnsEnde(feld: HTMLInputElement) {
    const ende = feld.value.length;
    // Eine Auswahl über mehrere Zeichen (alles markieren zum Ersetzen)
    // bleibt stehen — nur die blosse Einfügemarke wird ans Ende gerückt.
    if (feld.selectionStart === feld.selectionEnd) {
      feld.setSelectionRange(ende, ende);
    }
  }

  const fehler = codeStatus.error;
  const kaestchenRot = fehler !== null && getipptNach !== codeStatus;
  const kaestchen = Math.max(codeLaenge, ziffern.length);
  // Zwei Vierergruppen bei acht Stellen, zwei Dreiergruppen bei sechs — wie
  // eine Telefonnummer, die man sich in Stücken merkt statt am Stück.
  const gruppe = kaestchen % 4 === 0 ? 4 : kaestchen % 3 === 0 ? 3 : kaestchen;
  const aktiv = Math.min(ziffern.length, kaestchen - 1);

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="text-display font-semibold">E-Mail bestätigen</h1>
        <p className="text-sm text-muted">
          Wir haben einen {codeLaenge}-stelligen Code an{" "}
          <span className="font-medium text-foreground">{emailHinweis}</span>{" "}
          geschickt. Er gilt {gueltigMinuten} Minuten.
        </p>
      </header>

      <form
        ref={formRef}
        action={codeAbsenden}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="code" className="text-sm font-medium">
            Code aus der E-Mail
          </label>

          {/* Ein echtes Eingabefeld über der ganzen Kästchenreihe, nicht acht
              einzelne: so funktionieren Einfügen, Löschen, die
              Autovervollständigung aus der Mitteilung und Screenreader wie
              bei jedem anderen Feld. Die Kästchen darunter sind nur die
              Anzeige dessen, was darin steht. */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="flex items-stretch gap-1.5 sm:gap-2"
            >
              {Array.from({ length: kaestchen }, (_, i) => {
                const ziffer = ziffern[i];
                const istAktiv = fokussiert && i === aktiv && !codeLaeuft;
                const gruppenEnde = (i + 1) % gruppe === 0 && i < kaestchen - 1;
                return (
                  <div key={i} className="contents">
                    <div
                      className={cn(
                        "relative flex h-14 min-w-0 flex-1 items-center justify-center rounded-md border font-mono text-2xl font-semibold transition-colors duration-fast",
                        kaestchenRot
                          ? "border-danger/60"
                          : istAktiv
                            ? "border-accent ring-2 ring-accent/15"
                            : ziffer
                              ? "border-border-strong"
                              : "border-border-control",
                        ziffer ? "bg-transparent" : "bg-surface",
                      )}
                    >
                      {ziffer}
                      {istAktiv && !ziffer && (
                        <span className="h-6 w-px animate-pulse bg-foreground" />
                      )}
                    </div>
                    {gruppenEnde && (
                      <span className="flex w-2 shrink-0 items-center justify-center text-muted sm:w-3">
                        <span className="h-px w-full bg-border-strong" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <input
              id="code"
              name="code"
              type="text"
              required
              // one-time-code lässt iOS und Android den Code direkt aus der
              // Mitteilung heraus anbieten — der kürzeste Weg vom Postfach
              // zurück ins Formular, und der Grund, warum der Code auch im
              // Betreff der Vorlage steht.
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9 \-]*"
              autoFocus
              spellCheck={false}
              onChange={beiEingabe}
              onFocus={(e) => {
                setFokussiert(true);
                caretAnsEnde(e.currentTarget);
              }}
              // Die Schrift im Feld ist unsichtbar und läuft nicht mit den
              // Kästchen gleich: ein Tipp auf das dritte Kästchen setzte die
              // Einfügemarke sonst irgendwo in den Text, und die nächste
              // Ziffer landete mitten im Code statt am Ende.
              onClick={(e) => caretAnsEnde(e.currentTarget)}
              onBlur={() => setFokussiert(false)}
              aria-invalid={fehler ? true : undefined}
              aria-describedby={fehler ? "code-fehler" : undefined}
              // Unsichtbar, aber da: es liegt über den Kästchen, fängt jeden
              // Tipp ab und bleibt fokussier- und einfügbar. text-base hält
              // Safari auf iOS vom Hineinzoomen ab (siehe components/ui/Input).
              className="absolute inset-0 h-full w-full cursor-text bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent"
            />
          </div>

          {fehler && (
            <p id="code-fehler" role="alert" className="text-sm text-danger">
              {fehler}
            </p>
          )}
        </div>

        <Button type="submit" disabled={codeLaeuft}>
          {codeLaeuft ? "Wird geprüft…" : "Konto aktivieren"}
        </Button>
      </form>

      {/* Alles, was nur braucht, wer nicht weiterkommt — abgesetzt, damit
          es neben dem einen Weg nach vorn nicht mitspricht. */}
      <div className="flex flex-col gap-3 border-t border-border pt-5 text-sm">
        {/* Eigenes Formular statt eines zweiten Knopfes im ersten: ein
            verschachteltes <form> gibt es nicht, und der erneute Versand
            darf den eingetippten Code nicht mitschicken. */}
        <form
          action={erneutAbsenden}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
        >
          <span className="text-muted">Nichts angekommen? Schau im Spam.</span>
          <button
            type="submit"
            disabled={erneutLaeuft || restSekunden > 0}
            className={textAktionClassName({
              className:
                "tabular-nums disabled:pointer-events-none disabled:text-muted disabled:no-underline",
            })}
          >
            {erneutLaeuft
              ? "Wird gesendet…"
              : restSekunden > 0
                ? `Neuer Code in ${restSekunden} s`
                : "Neuen Code senden"}
          </button>
        </form>
        {erneutStatus.gesendet ? (
          <p role="status" className="text-success">
            Ein neuer Code ist unterwegs. Der alte gilt nicht mehr.
          </p>
        ) : (
          erneutStatus.error && (
            <p role="alert" className="text-danger">
              {erneutStatus.error}
            </p>
          )
        )}

        <p className="text-muted">
          Falsche Adresse?{" "}
          <Link
            href="/registrieren"
            className="font-medium text-accent-ink hover:underline"
          >
            Nochmal registrieren
          </Link>
        </p>
        {/* Für eine schon registrierte Adresse schickt signUp() bewusst
            keinen Fehler und keinen Code (keine Konto-Enumeration, siehe
            lib/actions/auth.ts). Ohne diesen Satz wartete, wer sein Konto
            vergessen hat, hier auf eine Mail, die nie kommt. */}
        <p className="text-muted">
          Schon ein Konto mit dieser Adresse?{" "}
          <Link href="/anmelden" className="font-medium text-accent-ink hover:underline">
            Zur Anmeldung
          </Link>
        </p>
      </div>
    </>
  );
}
