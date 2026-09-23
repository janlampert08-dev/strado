"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addVehicleInline } from "@/lib/actions/vehicles";
import { passFolgenUmschalten } from "@/lib/actions/paesse";
import { einrichtungAbschliessen } from "@/lib/actions/einrichtung";
import { fahrzeugtypdefinition } from "@/lib/motorklassen";
import type { FahrzeugTyp, Getriebe, Vehicle } from "@/types/database";
import Button, { buttonVariants } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { segmentClassName, segmentHuelleClassName } from "@/components/ui/SegmentedControl";
import { AutoIcon, HakenIcon, MotorradIcon } from "@/components/NavIcons";
import { cn } from "@/lib/utils/cn";

export interface EinrichtungPass {
  id: string;
  name: string;
  hoeheM: number;
  folgtMan: boolean;
}

type Schritt = "fahrzeug" | "paesse" | "fertig";

/**
 * Die Einrichtung nach der Registrierung, in höchstens drei Schritten:
 * Fahrzeug, Pässe, fertig. Jeder lässt sich überspringen, "Später" oben
 * rechts beendet das Ganze — und beides zählt als erledigt, damit niemand
 * die Seite ein zweites Mal sieht.
 *
 * Warum genau diese zwei Fragen und keine Tour durch die App:
 * - Das Fahrzeug entscheidet, in welcher Klasse eine Zeit gewertet wird.
 *   Ohne es zählt die erste Fahrt nur in der Gesamtwertung.
 * - Den Pässen zu folgen ist das Einzige, was sofort etwas bringt, ohne dass
 *   man schon gefahren ist: öffnet oder schliesst einer, steht es in der
 *   Aktivität.
 * Alles andere lernt man beim Fahren. Eine Folge von Erklärbildern vorneweg
 * wird erfahrungsgemäss weggewischt, ohne gelesen zu werden.
 */
export default function Einrichtung({
  hatFahrzeug,
  paesse,
  ziel,
}: {
  hatFahrzeug: boolean;
  paesse: EinrichtungPass[];
  /** Geprüftes Ziel danach (zielNachEinrichtung), "/" ohne eigenes. */
  ziel: string;
}) {
  const router = useRouter();
  // Ein Schritt, der nichts zu fragen hat, entfällt ganz — auch aus dem
  // Fortschrittsbalken, damit "2 von 3" nicht lügt.
  const schritte: Schritt[] = [
    ...(hatFahrzeug ? [] : (["fahrzeug"] as const)),
    ...(paesse.length > 0 ? (["paesse"] as const) : []),
    "fertig",
  ];
  const [schritt, setSchritt] = useState<Schritt>(schritte[0]);
  const index = schritte.indexOf(schritt);

  const [fahrzeug, setFahrzeug] = useState<Vehicle | null>(null);
  const [gefolgt, setGefolgt] = useState<Set<string>>(
    () => new Set(paesse.filter((p) => p.folgtMan).map((p) => p.id)),
  );
  const [beendet, starteBeenden] = useTransition();

  // Gibt es nichts zu fragen (Fahrzeug schon da, Passkatalog nicht
  // erreichbar), beginnt die Seite gleich bei "fertig" — weiter() läuft dann
  // nie, also hier festhalten.
  const nurFertig = schritte.length === 1;
  useEffect(() => {
    if (nurFertig) void einrichtungAbschliessen();
  }, [nurFertig]);

  function weiter() {
    const naechster = schritte[index + 1];
    if (naechster === "fertig") {
      // Schon beim Erreichen festhalten, nicht erst beim Klick auf einen der
      // Wege hinaus: wer hier den Tab schliesst, ist trotzdem durch.
      void einrichtungAbschliessen();
    }
    setSchritt(naechster);
  }

  function spaeter() {
    starteBeenden(async () => {
      await einrichtungAbschliessen();
      router.push(ziel);
    });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
      <div className="mx-auto flex w-full max-w-md items-center gap-4 px-5 pt-4">
        {/* Der Fortschritt als Segmente statt Punkte: gleich breit, gleich
            weit — man sieht, wie viel noch kommt, nicht nur, wo man ist. */}
        <ol
          className="flex flex-1 gap-1.5"
          aria-label={`Schritt ${index + 1} von ${schritte.length}`}
        >
          {schritte.map((s, i) => (
            <li
              key={s}
              aria-hidden="true"
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-base",
                i < index ? "bg-foreground/40" : i === index ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </ol>
        {schritt !== "fertig" && (
          <button
            type="button"
            onClick={spaeter}
            disabled={beendet}
            className="-mr-2 min-h-11 px-2 text-sm font-medium text-foreground transition-opacity duration-fast hover:opacity-70 disabled:opacity-50"
          >
            Später
          </button>
        )}
      </div>

      {/* Unten ausgerichtet: auf dem Telefon liegt die Frage da, wo der
          Daumen ist, und der Knopf darunter immer an derselben Stelle. */}
      <main
        key={schritt}
        className="einrichtung-schritt mx-auto flex w-full max-w-md flex-1 flex-col justify-end gap-8 px-5 pt-10 pb-6 sm:justify-center"
      >
        {schritt === "fahrzeug" && (
          <FahrzeugSchritt
            onGespeichert={(v) => {
              setFahrzeug(v);
              weiter();
            }}
            onUeberspringen={weiter}
          />
        )}
        {schritt === "paesse" && (
          <PaesseSchritt
            paesse={paesse}
            gefolgt={gefolgt}
            setGefolgt={setGefolgt}
            onWeiter={weiter}
          />
        )}
        {schritt === "fertig" && (
          <FertigSchritt
            fahrzeug={fahrzeug}
            anzahlPaesse={gefolgt.size}
            ziel={ziel}
          />
        )}
      </main>
    </div>
  );
}

function Kopf({ titel, text }: { titel: string; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{titel}</h1>
      <p className="text-sm text-muted text-pretty">{text}</p>
    </div>
  );
}

function FahrzeugSchritt({
  onGespeichert,
  onUeberspringen,
}: {
  onGespeichert: (fahrzeug: Vehicle) => void;
  onUeberspringen: () => void;
}) {
  const [typ, setTyp] = useState<FahrzeugTyp | null>(null);
  const [getriebe, setGetriebe] = useState<Getriebe>("manuell");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const einheit = typ ? fahrzeugtypdefinition(typ).leistungseinheit : "PS";

  function speichern(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!typ) return;
    const formData = new FormData(event.currentTarget);
    formData.set("typ", typ);
    formData.set("getriebe", getriebe);
    setFehler(null);
    starte(async () => {
      const ergebnis = await addVehicleInline(formData);
      if (ergebnis.error || !ergebnis.vehicle) {
        setFehler(ergebnis.error ?? "Fahrzeug konnte nicht gespeichert werden.");
        return;
      }
      onGespeichert(ergebnis.vehicle);
    });
  }

  return (
    <>
      <Kopf
        titel="Was fährst du?"
        text="Damit deine Zeiten in der richtigen Klasse landen — Autos und Motorräder haben je eigene Ranglisten."
      />

      <form onSubmit={speichern} className="flex flex-col gap-6">
        <div role="group" aria-label="Fahrzeugtyp" className="grid grid-cols-2 gap-3">
          {(
            [
              { id: "auto", label: "Auto", Icon: AutoIcon },
              { id: "motorrad", label: "Motorrad", Icon: MotorradIcon },
            ] as const
          ).map(({ id, label, Icon }) => {
            const aktiv = typ === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={aktiv}
                onClick={() => setTyp(id)}
                className={cn(
                  "flex min-h-28 flex-col items-start justify-between rounded-lg border p-4 text-left transition-colors duration-fast",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  aktiv
                    ? "border-accent bg-accent-subtle text-foreground"
                    : "border-border-control text-foreground hover:border-border-strong",
                )}
              >
                <Icon
                  className={cn("h-7 w-7", aktiv ? "text-accent" : "text-muted")}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="text-base font-semibold">{label}</span>
              </button>
            );
          })}
        </div>

        {typ && (
          <div className="einrichtung-schritt flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Marke
                <Input
                  name="marke"
                  required
                  maxLength={60}
                  autoComplete="off"
                  placeholder={typ === "auto" ? "z.B. Porsche" : "z.B. Ducati"}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Modell
                <Input
                  name="modell"
                  required
                  maxLength={60}
                  autoComplete="off"
                  placeholder={typ === "auto" ? "z.B. Cayman" : "z.B. Monster"}
                />
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <span id="getriebe-titel" className="text-sm font-medium">
                Getriebe
              </span>
              <div role="group" aria-labelledby="getriebe-titel" className={segmentHuelleClassName("self-start")}>
                {(["manuell", "automatik"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={getriebe === g}
                    onClick={() => setGetriebe(g)}
                    className={segmentClassName(getriebe === g)}
                  >
                    {g === "manuell" ? "Manuell" : "Automatik"}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>
                Leistung in {einheit} <span className="font-normal text-muted">(freiwillig)</span>
              </span>
              <Input
                name={einheit === "PS" ? "leistung_ps" : "leistung_kw"}
                inputMode="decimal"
                autoComplete="off"
                placeholder={einheit === "PS" ? "z.B. 300" : "z.B. 81"}
              />
              <span className="text-xs font-normal text-muted">
                Mit der Leistung zählen deine Zeiten zusätzlich in deiner Motorklasse.
              </span>
            </label>
          </div>
        )}

        {fehler && (
          <p role="alert" className="text-sm text-danger">
            {fehler}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="accent" size="lg" className="w-full" disabled={!typ || laeuft}>
            {laeuft ? "Speichern…" : "Weiter"}
          </Button>
          <button
            type="button"
            onClick={onUeberspringen}
            className="min-h-11 text-sm text-muted transition-colors duration-fast hover:text-foreground"
          >
            Ohne Fahrzeug weiter
          </button>
        </div>
      </form>
    </>
  );
}

function PaesseSchritt({
  paesse,
  gefolgt,
  setGefolgt,
  onWeiter,
}: {
  paesse: EinrichtungPass[];
  gefolgt: Set<string>;
  setGefolgt: (update: (vorher: Set<string>) => Set<string>) => void;
  onWeiter: () => void;
}) {
  const [, starte] = useTransition();

  function umschalten(passId: string) {
    const umkehren = (vorher: Set<string>) => {
      const neu = new Set(vorher);
      if (neu.has(passId)) neu.delete(passId);
      else neu.add(passId);
      return neu;
    };
    // Sofort sichtbar, danach vom Server bestätigt — schlägt es fehl,
    // springt der Haken zurück, statt still falsch stehen zu bleiben.
    setGefolgt(umkehren);
    starte(async () => {
      const ergebnis = await passFolgenUmschalten(passId);
      if (!ergebnis.ok) setGefolgt(umkehren);
    });
  }

  return (
    <>
      <Kopf
        titel="Welche Pässe willst du im Blick behalten?"
        text="Öffnet oder schliesst einer, steht es in deiner Aktivität. Du kannst das jederzeit unter Pässe ändern."
      />

      <ul className="-mx-1 flex flex-col">
        {paesse.map((pass) => {
          const aktiv = gefolgt.has(pass.id);
          return (
            <li key={pass.id}>
              <button
                type="button"
                aria-pressed={aktiv}
                onClick={() => umschalten(pass.id)}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-lg px-1 text-left transition-colors duration-fast hover:bg-surface",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-fast",
                    aktiv ? "border-accent bg-accent text-background" : "border-border-control",
                  )}
                >
                  {aktiv && <HakenIcon className="h-3.5 w-3.5" strokeWidth={2.5} />}
                </span>
                <span className="flex-1 text-base font-medium">{pass.name}</span>
                <span className="text-sm tabular-nums text-muted">
                  {pass.hoeheM.toLocaleString("de-CH")} m
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="accent" size="lg" className="w-full" onClick={onWeiter}>
        {gefolgt.size > 0 ? "Weiter" : "Ohne Pässe weiter"}
      </Button>
    </>
  );
}

function FertigSchritt({
  fahrzeug,
  anzahlPaesse,
  ziel,
}: {
  fahrzeug: Vehicle | null;
  anzahlPaesse: number;
  ziel: string;
}) {
  // Die eigenen Antworten noch einmal, in einer Zeile: das ist die Quittung,
  // dass sie angekommen sind — und wo sie wirken.
  const echo = [
    fahrzeug ? `${fahrzeug.marke} ${fahrzeug.modell}` : null,
    anzahlPaesse > 0 ? `${anzahlPaesse} ${anzahlPaesse === 1 ? "Pass" : "Pässe"} im Blick` : null,
  ].filter((teil): teil is string => teil !== null);

  // Mit eigenem Ziel (z.B. /paesse aus "Anmelden, um zu folgen") geht es
  // dorthin. Ohne eines ist die erste Fahrt der Weg, auf dem die App ihren
  // Wert zeigt — die Startseite ist die zweite Wahl.
  const eigenesZiel = ziel !== "/";

  return (
    <>
      <Kopf
        titel="Alles bereit."
        text={
          echo.length > 0
            ? `${echo.join(" · ")}. Nach deiner ersten Fahrt siehst du hier deine Zeit, dein Tempo und wo du in der Rangliste stehst.`
            : "Fahrzeug und Pässe kannst du jederzeit im Profil ergänzen. Nach deiner ersten Fahrt siehst du deine Zeit, dein Tempo und wo du in der Rangliste stehst."
        }
      />
      <div className="flex flex-col gap-2">
        {eigenesZiel ? (
          <Link href={ziel} className={buttonVariants({ variant: "accent", size: "lg", className: "w-full" })}>
            Weiter
          </Link>
        ) : (
          <>
            <Link
              href="/fahrten/neu"
              className={buttonVariants({ variant: "accent", size: "lg", className: "w-full" })}
            >
              Erste Fahrt aufzeichnen
            </Link>
            <Link href="/" className={buttonVariants({ variant: "secondary", className: "w-full" })}>
              Strecken entdecken
            </Link>
          </>
        )}
      </div>
    </>
  );
}
