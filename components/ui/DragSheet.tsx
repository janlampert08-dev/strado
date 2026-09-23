"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  DRAG_DECISION_THRESHOLD_PX,
  DRAG_TAP_THRESHOLD_PX,
  clampSheetHeight,
  decideSheetGesture,
  FEDER_RUHIG,
  federFuer,
  federRuht,
  federSchritt,
  gummibandHoehe,
  nextSnapOnTap,
  sheetHeightFor,
  sheetSnapHeights,
  snapAfterFling,
  snapStep,
  wischGeschwindigkeit,
  type Feder,
  type FederZustand,
  type SheetGesture,
  type SheetHeights,
  type SheetSnap,
} from "@/lib/dragSheet";

// So lange nach der letzten Ziehbewegung gilt ein Klick als Nachwehe der
// Wischgeste. Der vom Browser nachgereichte Klick kommt unmittelbar nach dem
// touchend, eine echte Bedienung frühestens deutlich später.
const CLICK_SUPPRESSION_MS = 400;

// Notnagel für die Griffhöhe, bis der ResizeObserver unten den echten Wert
// gemessen hat (und dauerhaft ab md, wo der Griff ausgeblendet ist und
// deshalb 0 misst). Entspricht py-5 + h-1 am Griff-Element.
const HANDLE_FALLBACK_PX = 44;

// Höhe der Kompaktzeile (siehe Prop `kompakt`), fest statt gemessen: sie ist
// eine Zeile mit fester Höhe (h-14), und eine Messung verlangte, sie auch
// ausserhalb des eingeklappten Zustands im Layout zu halten.
const KOMPAKT_PX = 56;

// Abbremsung des Listen-Nachlaufs, wenn eine Sheet-Geste über die Vollhöhe
// hinaus den Inhalt weitergescrollt hat — der Wert von UIScrollView
// "normal", damit der Nachlauf ausläuft wie das native Scrollen daneben.
const NACHLAUF_ABBREMSUNG = 0.998;

function reduzierteBewegung() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Gemeinsame Bottom-Sheet-Mechanik (Mobile): zwischen drei Rastpunkten
// auf-/zuziehbar — versteckt (nur der Ziehgriff steht über der Karte), Peek
// und die volle Höhe des Containers. Aufgezogen liegt das Sheet damit
// vollständig über der Karte — bis zu einer früheren Fassung blieb oben ein
// Streifen Karte stehen (expandedGapPx, 96px), der den Inhalt auf kleinen
// Geräten um eine Handvoll Zeilen beschnitt, ohne dass der Streifen für die
// Orientierung gereicht hätte.
//
// Der dritte Rastpunkt ("versteckt") kam dazu, weil die Karte auf dem Handy
// vorher nie ganz zu sehen war: das Sheet stand mindestens in Peek-Höhe im
// Bild (auf der Streckendetailseite 320px), und wer die Strecke am unteren
// Bildrand sehen wollte, konnte es nur aufziehen, nicht wegschieben. Ganz
// verschwinden darf es nicht — der Ziehgriff bleibt stehen, sonst gäbe es
// keinen Weg zurück. Im versteckten Zustand ist der Inhalt ausserdem `inert`:
// er ist nur weggeschnitten (overflow-hidden), bliebe also sonst für Tastatur
// und Screenreader erreichbar und würde beim Fokussieren im 36px-Fenster
// herumscrollen.
//
// Nach unten endet das Sheet über der fixierten BottomNav
// (bottom: var(--bottom-nav-h), s. globals.css) statt am Bildschirmrand.
// Vorher lief es bis ganz nach unten und damit unter die Leiste: die ist
// zwar halbtransparent, liegt aber auf z-40 und fing jeden Tipp ab. Auf der
// Startseite landete der Knopf „Strecken in meiner Nähe" in Peek-Höhe genau
// in diesem Streifen — ein Tipp darauf öffnete einen Navigationspunkt statt
// die Standortsuche. Das betraf jeden Inhalt in den untersten ~64px des
// Sheets, nicht nur diesen Knopf. Zwei Wege führen hinauf — der Ziehgriff (ziehen
// oder tippen) und die Wischgeste im Inhalt selbst: unterhalb der Vollhöhe
// zieht ein Wisch nach oben das Sheet weiter auf, aufgeklappt scrollt derselbe
// Wisch den Inhalt, und ein Wisch nach unten am Anfang des Inhalts geht einen
// Rastpunkt tiefer. Vorher liess sich das Sheet nur über den Griff
// öffnen, was in der eingeklappten Ansicht wie eine tote Fläche wirkte.
// Extrahiert aus ExploreView.tsx, damit dieselbe Geste konsistent auf
// mehreren Seiten läuft (Explore-Liste, Routendetail) statt der Algorithmus
// zweimal leicht unterschiedlich existiert. Ab md: display:contents, die
// Positionierung greift dort nicht mehr — der Aufrufer übernimmt ab md die
// gewohnte Liste/Detail-links, Karte-rechts-Aufteilung über eigene Klassen.
export default function DragSheet({
  containerRef,
  peekPx,
  handleLabels,
  onOccludedBottomChange,
  className = "",
  kompakt,
  children,
}: {
  containerRef: RefObject<HTMLElement | null>;
  peekPx: number;
  handleLabels: { expand: string; collapse: string };
  // Meldet, wie viele Pixel am unteren Rand des Containers das Sheet verdeckt
  // (inklusive der BottomNav darunter) — ab md immer 0, da das Sheet dort
  // keine eigene Box mehr hat. Die Karte darunter füllt den ganzen Container;
  // ohne diesen Wert passt sie ihren Ausschnitt auf eine Fläche ein, von der
  // ein gutes Stück unter dem Sheet liegt, und die Strecke steht dann halb
  // verdeckt und zu nah im sichtbaren Rest (siehe RouteMap.tsx, bottomInsetPx).
  //
  // Muss über Renderzyklen stabil sein (eine State-Setter-Funktion etwa) —
  // der Wert steht in den Abhängigkeiten des meldenden Effekts.
  onOccludedBottomChange?: (px: number) => void;
  className?: string;
  /**
   * Was eingeklappt unter dem Griff stehen bleibt — eine Zeile, 56 px.
   * Ohne sie zeigte das eingeklappte Sheet nur den Griff: im Review stand man
   * auf der Streckenseite vor einer Karte ohne jeden Hinweis, welche Strecke
   * das ist. Mit ihr bleibt die volle Kartenansicht erhalten, und der Name
   * steht trotzdem da. Tippen darauf holt das Sheet auf Peek zurück.
   */
  kompakt?: ReactNode;
  children: ReactNode;
}) {
  const inhaltId = useId();
  const [snap, setSnap] = useState<SheetSnap>("peek");
  // Als Boolean für die Abhängigkeitslisten: `kompakt` ist ein ReactNode und
  // bei jedem Render ein neues Objekt — direkt als Abhängigkeit hinge jeder
  // Render die Touch- und Resize-Listener neu an.
  const hatKompakt = kompakt !== undefined && kompakt !== null;
  // Ob gerade ein Finger das Sheet zieht. Nur für die Kompaktzeile: die Höhe
  // selbst läuft während Geste und Einrasten NICHT über React-State. Bis
  // 2026-09-23 setzte jede Fingerbewegung einen State und renderte das Sheet
  // neu, und das Einrasten war eine CSS-Transition auf `height` mit fester
  // Dauer — zusammen liess das die Liste beim Wischen ruckeln und nach dem
  // Loslassen schlagartig das Tempo wechseln. Jetzt schreiben Geste und
  // Feder die Höhe direkt in `--sheet-h` (schreibeHoehe unten).
  const [zieht, setZieht] = useState(false);
  // Ob das Sheet überhaupt als Sheet läuft — ab md ist der Wrapper
  // display:contents und der Inhalt ist die normale Seitenleiste.
  const [istSheet, setIstSheet] = useState(true);
  // Gemessen statt konstant: die Griffhöhe ist die Höhe des versteckten
  // Sheets, und eine Zahl, die neben den Griff-Klassen zweitgeschrieben wird,
  // driftet beim ersten Umbau des Griffs auseinander.
  const [handleHeight, setHandleHeight] = useState(HANDLE_FALLBACK_PX);
  // heights wird beim Gestenbeginn EINMAL gemessen und dann mitgeführt —
  // siehe messeHoehen() unten, warum nicht bei jeder Bewegung neu.
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    height: number;
    moved: boolean;
    heights: SheetHeights;
    proben: { t: number; h: number }[];
  } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  // Ein Wisch, der auf einem Link oder Button beginnt und das Sheet zieht,
  // darf beim Loslassen nicht auch noch klicken. Browser unterdrücken den
  // Klick nach einem abgefangenen touchmove meist selbst — "meist" reicht
  // hier nicht, weil der Fehlfall eine ungewollte Navigation wäre.
  //
  // Bewusst ein Zeitfenster und keine Flagge: eine Flagge, die nur ein
  // folgender Klick löscht, bliebe nach einem Wisch, der auf keinem
  // klickbaren Element endet, stehen — und verschluckte dann die nächste
  // Aktivierung per Tastatur, die ohne pointerdown daherkommt.
  const suppressClickUntilRef = useRef(0);

  // Aufgezogen die Höhe der *Inhaltsbox* des Containers, nicht 100% seiner
  // Polsterbox: Prozenthöhen beziehen sich auf letztere, das Sheet wäre also
  // um die abgezogene BottomNav-Höhe zu hoch und schöbe seinen Kopf unter die
  // Kopfleiste (unten steht es mit bottom: var(--bottom-nav-h) auf der
  // Inhaltskante auf). Derselbe Wert, den messeHoehen() unten für die
  // Ziehmathematik rechnet — sonst driften CSS und Geste auseinander.
  const sheetHeight =
    snap === "voll"
      ? "calc(100% - var(--bottom-nav-h))"
      : snap === "peek"
        ? `${peekPx}px`
        : `${handleHeight + (hatKompakt ? KOMPAKT_PX : 0)}px`;
  // Für die Feder, die erst nach ihrem letzten Frame den Ruhewert schreibt —
  // dann ist React mit dem neuen Rastpunkt längst durch.
  const ruheHoeheRef = useRef(sheetHeight);
  useLayoutEffect(() => {
    ruheHoeheRef.current = sheetHeight;
  });

  // Der Rastpunkt, auf den das Sheet gerade zuläuft oder auf dem es steht.
  // Getrennt vom State `snap`, damit der Snap-Effekt unten erkennt, ob eine
  // Geste die Feder schon gestartet hat.
  const zielRef = useRef<SheetSnap>("peek");
  const federRef = useRef<number | null>(null);
  const nachlaufRef = useRef<number | null>(null);
  // Hält gerade ein Finger das Sheet? Dann schreibt kein Effekt dazwischen.
  const haeltRef = useRef(false);

  // MISST, und das kostet: getComputedStyle und clientHeight erzwingen beide
  // ein sofortiges Neuberechnen von Stil und Layout. Beim Ziehen setzt jede
  // Bewegung eine neue Höhe, macht das Layout also gerade schmutzig — hier
  // dann zu messen ist genau das Muster, das eine Geste ruckeln lässt
  // (Layout-Thrashing: schreiben, lesen, schreiben, lesen).
  //
  // Deshalb: einmal beim Gestenbeginn aufrufen, den Wert in der Geste
  // mitführen. Der Container ist das <main> und behält seine Höhe für die
  // Dauer eines Fingerzugs; nur eine Drehung des Geräts mitten in der Geste
  // änderte sie, und die bricht den Zeiger ohnehin ab.
  const messeHoehen = useCallback((): SheetHeights => {
    const el = containerRef.current;
    const minPx = handleHeight + (hatKompakt ? KOMPAKT_PX : 0);
    if (!el) return { minPx, peekPx, maxPx: window.innerHeight };
    // Das Sheet endet am unteren Rand der *Inhaltsbox* des Containers, nicht
    // an dessen Polsterkante (bottom: var(--bottom-nav-h) unten) — die
    // Vollhöhe ist deshalb die Inhaltshöhe. Mit clientHeight (Inhalt plus
    // Polsterung) wüchse das aufgezogene Sheet um genau die Höhe der
    // BottomNav über den Container hinaus und schöbe seinen Kopf unter die
    // Kopfleiste.
    const stil = getComputedStyle(el);
    const polsterung =
      (parseFloat(stil.paddingTop) || 0) + (parseFloat(stil.paddingBottom) || 0);
    return { minPx, peekPx, maxPx: el.clientHeight - polsterung };
  }, [containerRef, handleHeight, peekPx, hatKompakt]);

  // Die angezeigte Höhe, jenseits der Enden gummibandgedehnt — direkt ins
  // Element, am React-Render vorbei (siehe `zieht` oben).
  const schreibeHoehe = useCallback((px: number, heights: SheetHeights) => {
    sheetRef.current?.style.setProperty("--sheet-h", `${gummibandHoehe(px, heights)}px`);
  }, []);

  const stoppeBewegung = useCallback(() => {
    if (federRef.current !== null) cancelAnimationFrame(federRef.current);
    federRef.current = null;
    if (nachlaufRef.current !== null) cancelAnimationFrame(nachlaufRef.current);
    nachlaufRef.current = null;
  }, []);

  // Lässt das Sheet per Feder auf `ziel` laufen — ab der Höhe, auf der es
  // GERADE steht, und mit der Geschwindigkeit des Fingers beim Loslassen
  // (px/s, positiv = nach oben). So gibt es zwischen Ziehen und Einrasten
  // keine Naht, und ein Griff mitten ins Einrasten hält das Sheet dort an,
  // wo es ist. Angekommen steht wieder der Ruhewert im Element (für "voll"
  // ein calc(), das Grössenänderungen ohne JS folgt).
  const laufZu = useCallback(
    (ziel: SheetSnap, geschwindigkeit: number, feder?: Feder) => {
      const sheet = sheetRef.current;
      stoppeBewegung();
      zielRef.current = ziel;
      if (!sheet) return;
      const heights = messeHoehen();
      const zielPx = sheetHeightFor(ziel, heights);
      if (reduzierteBewegung()) {
        sheet.style.setProperty("--sheet-h", `${zielPx}px`);
        return;
      }
      const parameter = feder ?? federFuer(geschwindigkeit);
      let zustand: FederZustand = { x: sheet.offsetHeight, v: geschwindigkeit };
      let zuletzt = performance.now();
      const schritt = (jetzt: number) => {
        // Höchstens 64 ms pro Schritt: nach einem Tab-Wechsel soll die Feder
        // nicht mit einer Sekunde Rückstand weiterrechnen.
        const dt = Math.min(0.064, (jetzt - zuletzt) / 1000);
        zuletzt = jetzt;
        zustand = federSchritt(zustand, zielPx, dt, parameter);
        if (federRuht(zustand, zielPx)) {
          federRef.current = null;
          sheet.style.setProperty("--sheet-h", ruheHoeheRef.current);
          return;
        }
        schreibeHoehe(zustand.x, heights);
        federRef.current = requestAnimationFrame(schritt);
      };
      federRef.current = requestAnimationFrame(schritt);
    },
    [messeHoehen, schreibeHoehe, stoppeBewegung],
  );

  // Rastpunktwechsel, die keine Geste ausgelöst hat (Pfeiltasten,
  // Kompaktzeile), laufen ruhig ein, ohne Schwung. In Ruhe führt derselbe
  // Effekt den Ruhewert nach, wenn sich Peek- oder Griffhöhe ändern.
  useLayoutEffect(() => {
    if (zielRef.current !== snap) {
      laufZu(snap, 0, FEDER_RUHIG);
      return;
    }
    if (federRef.current === null && !haeltRef.current) {
      sheetRef.current?.style.setProperty("--sheet-h", sheetHeight);
    }
  }, [snap, sheetHeight, laufZu]);

  useEffect(() => stoppeBewegung, [stoppeBewegung]);

  // Nachlauf der Liste, wenn eine Sheet-Geste über die Vollhöhe hinaus den
  // Inhalt gescrollt hat (siehe onTouchMove): dieses Scrollen hat nicht der
  // Browser gemacht, ein Wurf endete also sonst mit einem harten Halt.
  const nachlaufen = useCallback((scroller: HTMLElement, geschwindigkeit: number) => {
    if (reduzierteBewegung()) return;
    let v = geschwindigkeit;
    let zuletzt = performance.now();
    const schritt = (jetzt: number) => {
      const ms = Math.min(64, jetzt - zuletzt);
      zuletzt = jetzt;
      v *= NACHLAUF_ABBREMSUNG ** ms;
      const vorher = scroller.scrollTop;
      scroller.scrollTop = vorher + (v * ms) / 1000;
      if (Math.abs(v) < 20 || scroller.scrollTop === vorher) {
        nachlaufRef.current = null;
        return;
      }
      nachlaufRef.current = requestAnimationFrame(schritt);
    };
    nachlaufRef.current = requestAnimationFrame(schritt);
  }, []);

  // Die echte Griffhöhe. Ab md ist der Griff md:hidden und misst 0 — dann
  // bleibt der Notnagel stehen, damit die Geste nach einer Rückkehr unter md
  // nicht mit einer Höhe von 0 rechnet.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const beobachter = new ResizeObserver(() => {
      const hoehe = handle.offsetHeight;
      if (hoehe > 0) setHandleHeight(hoehe);
    });
    beobachter.observe(handle);
    return () => beobachter.disconnect();
  }, []);

  // Meldet die verdeckte Fläche an den Aufrufer (siehe Prop oben) und hält
  // nebenbei fest, ob das Sheet überhaupt eines ist. Bewusst am Rastpunkt
  // gerechnet statt am laufenden Element gemessen: während der
  // Höhen-Transition stünde dort noch die alte Höhe, und während des Ziehens
  // würde jede Bewegung die Karte neu einpassen.
  useEffect(() => {
    function melde() {
      const el = containerRef.current;
      const sheet = sheetRef.current;
      if (!el || !sheet) return;
      const alsSheet = getComputedStyle(sheet).display !== "contents";
      setIstSheet(alsSheet);
      if (!onOccludedBottomChange) return;
      if (!alsSheet) {
        onOccludedBottomChange(0);
        return;
      }
      const polsterUnten = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      onOccludedBottomChange(sheetHeightFor(snap, messeHoehen()) + polsterUnten);
    }
    melde();
    window.addEventListener("resize", melde);
    return () => window.removeEventListener("resize", melde);
  }, [containerRef, snap, messeHoehen, onOccludedBottomChange]);

  // Die Höhe, auf der das Sheet GERADE steht — nicht die des Rastpunkts.
  // Greift man es mitten im Einrasten, bleibt es unter dem Finger, statt
  // erst auf den Zielwert zu springen: die Feder hält an, und offsetHeight
  // liefert die zuletzt geschriebene Höhe.
  const greife = useCallback(
    (heights: SheetHeights) => {
      stoppeBewegung();
      haeltRef.current = true;
      return sheetRef.current?.offsetHeight || sheetHeightFor(zielRef.current, heights);
    },
    [stoppeBewegung],
  );

  // Rastet nach einer Geste ein — mit dem Schwung des Fingers und einem
  // kurzen Tick, wenn sich der Rastpunkt ändert (nur Android vibriert; iOS
  // kennt die API nicht).
  const einrasten = useCallback(
    (hoehe: number, proben: { t: number; h: number }[], heights: SheetHeights) => {
      haeltRef.current = false;
      const geschwindigkeit = wischGeschwindigkeit(proben);
      const ziel = snapAfterFling(hoehe, geschwindigkeit, heights);
      if (ziel !== zielRef.current) navigator.vibrate?.(8);
      laufZu(ziel, geschwindigkeit);
      setSnap(ziel);
      setZieht(false);
    },
    [laufZu],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const heights = messeHoehen();
      const currentHeight = greife(heights);
      dragRef.current = {
        startY: e.clientY,
        startHeight: currentHeight,
        height: currentHeight,
        moved: false,
        heights,
        proben: [{ t: performance.now(), h: currentHeight }],
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [messeHoehen, greife],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaY = drag.startY - e.clientY;
      if (!drag.moved && Math.abs(deltaY) > DRAG_TAP_THRESHOLD_PX) {
        drag.moved = true;
        setZieht(true);
      }

      const roh = drag.startHeight + deltaY;
      drag.height = clampSheetHeight(roh, drag.heights);
      drag.proben.push({ t: performance.now(), h: roh });
      if (drag.proben.length > 12) drag.proben.shift();
      // Angezeigt wird die gedehnte Höhe, eingerastet wird nach der echten.
      schreibeHoehe(roh, drag.heights);
    },
    [schreibeHoehe],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);

      if (!drag) return;

      // Reiner Tap (kaum Bewegung) schaltet um, statt am aktuellen Zustand
      // festzuhalten — sonst müsste man aus der Peek-Position immer ziehen.
      if (!drag.moved) {
        haeltRef.current = false;
        const ziel = nextSnapOnTap(zielRef.current);
        laufZu(ziel, 0, FEDER_RUHIG);
        setSnap(ziel);
        return;
      }

      einrasten(drag.height, drag.proben, drag.heights);
    },
    [einrasten, laufZu],
  );

  // Die Wischgeste im Inhalt hängt an nativen touch-Listenern statt an den
  // React-Handlern: touchmove muss `passive: false` sein, damit
  // preventDefault() das Scrollen des Inhalts unterbinden kann, sobald die
  // Geste dem Sheet gehört. React registriert seine Listener passiv.
  useEffect(() => {
    if (!sheetRef.current) return;
    // Als eigene, nicht-nullbare Konstante: die Handler unten sind
    // Funktionsdeklarationen, in die TypeScript die Einengung oben nicht
    // hineinträgt.
    const sheet: HTMLDivElement = sheetRef.current;

    let gesture: {
      startX: number;
      startY: number;
      // Wo der Finger aufsetzte — startY wird beim Übernehmen neu gesetzt,
      // die Tap-Schwelle für die Klickunterdrückung misst aber ab hier.
      aufsetzY: number;
      startHeight: number;
      height: number;
      scroller: HTMLElement | null;
      scrollStart: number;
      waagrecht: boolean;
      // Das Sheet war noch in Bewegung und wurde vom Finger gefangen: dann
      // gehört ihm die Geste, egal in welche Richtung sie weitergeht.
      gefangen: boolean;
      mode: SheetGesture | null;
      heights: SheetHeights;
      proben: { t: number; h: number }[];
    } | null = null;

    // Das gescrollte Element unter dem Finger — dessen scrollTop entscheidet,
    // ob ein Wisch nach unten noch Inhalt zurückzuscrollen hat.
    function findScroller(root: HTMLElement, target: EventTarget | null): HTMLElement | null {
      let node: Element | null = target instanceof Element ? target : null;
      while (node && node !== root && root.contains(node)) {
        if (node instanceof HTMLElement) {
          const overflowY = getComputedStyle(node).overflowY;
          if (
            (overflowY === "auto" || overflowY === "scroll") &&
            node.scrollHeight > node.clientHeight
          ) {
            return node;
          }
        }
        node = node.parentElement;
      }
      return null;
    }

    // Liegt unter dem Finger etwas, das waagrecht scrollt (Reiter)? Nur dann
    // darf eine schräge Geste dem Inhalt gehören, siehe decideSheetGesture.
    function hatWaagrechtScroller(root: HTMLElement, target: EventTarget | null): boolean {
      let node: Element | null = target instanceof Element ? target : null;
      while (node && node !== root && root.contains(node)) {
        if (node instanceof HTMLElement && node.scrollWidth > node.clientWidth) {
          const overflowX = getComputedStyle(node).overflowX;
          if (overflowX === "auto" || overflowX === "scroll") return true;
        }
        node = node.parentElement;
      }
      return false;
    }

    // Beendet eine laufende Geste: rastet ein, wenn sie das Sheet gezogen
    // hat. Eine Geste einfach fallen zu lassen ginge nicht — das Sheet
    // klebte sonst auf der zuletzt gezogenen Höhe fest.
    function settle() {
      const current = gesture;
      gesture = null;
      if (!current) return;
      if (current.mode !== "sheet") {
        // Gefangen, aber nicht bewegt: vom Fleck aus einrasten.
        if (current.gefangen) einrasten(current.height, [], current.heights);
        return;
      }
      const { scroller } = current;
      // Hat die Geste über die Vollhöhe hinaus den Inhalt gescrollt, bleibt
      // das Sheet oben, und der Schwung geht in die Liste statt ins Sheet —
      // ein Wurf nach unten mitten in der Liste soll sie zurückscrollen, nicht
      // das Sheet zuklappen.
      if (scroller && scroller.scrollTop > current.scrollStart) {
        einrasten(current.height, [], current.heights);
        nachlaufen(scroller, wischGeschwindigkeit(current.proben));
        return;
      }
      einrasten(current.height, current.proben, current.heights);
    }

    function onTouchStart(e: TouchEvent) {
      // Ein zweiter Finger, der auf dem Sheet aufsetzt, beendet die laufende
      // Geste hier — nicht erst beim Loslassen, wo sie sonst noch einmal
      // einrasten würde.
      settle();
      // Ab md ist der Wrapper display:contents — dort gibt es kein Sheet,
      // also auch keine Geste.
      if (getComputedStyle(sheet).display === "contents") return;
      if (e.touches.length !== 1) return;
      // Der Ziehgriff läuft weiter über die Pointer-Handler oben, inklusive
      // Tap-Umschalter; beides gleichzeitig würde die Höhe doppelt setzen.
      if (handleRef.current?.contains(e.target as Node)) return;

      const touch = e.touches[0];
      const heights = messeHoehen();
      // Läuft das Sheet noch, fängt der Finger es sofort — es bleibt stehen,
      // wo es gerade ist, statt erst fertig einzurasten.
      const gefangen = federRef.current !== null;
      const startHeight = gefangen
        ? greife(heights)
        : sheetRef.current?.offsetHeight || sheetHeightFor(zielRef.current, heights);
      const scroller = findScroller(sheet, e.target);
      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        aufsetzY: touch.clientY,
        startHeight,
        height: startHeight,
        heights,
        scroller,
        scrollStart: scroller?.scrollTop ?? 0,
        waagrecht: hatWaagrechtScroller(sheet, e.target),
        gefangen,
        mode: null,
        proben: [{ t: performance.now(), h: startHeight }],
      };
    }

    function onTouchMove(e: TouchEvent) {
      if (!gesture) return;
      // Ein zweiter Finger — auch einer, der ausserhalb des Sheets aufsetzt
      // und hier gar kein touchstart auslöst — macht aus dem Wisch eine
      // andere Geste (Pinch). Sie endet damit sofort, statt beim Loslassen
      // auf der zuletzt gemessenen Höhe einzurasten.
      if (e.touches.length !== 1) {
        settle();
        return;
      }
      const touch = e.touches[0];

      if (gesture.mode === null) {
        const deltaY = gesture.startY - touch.clientY;
        const deltaX = gesture.startX - touch.clientX;
        if (
          Math.abs(deltaY) < DRAG_DECISION_THRESHOLD_PX &&
          Math.abs(deltaX) < DRAG_DECISION_THRESHOLD_PX
        ) {
          return;
        }
        gesture.mode = gesture.gefangen
          ? "sheet"
          : decideSheetGesture({
              deltaY,
              deltaX,
              snap: zielRef.current,
              scrollTop: gesture.scroller?.scrollTop ?? 0,
              waagrechtScrollbar: gesture.waagrecht,
            });
        // Gehört die Geste dem Inhalt, hält sich das Sheet für den Rest
        // dieser Berührung heraus — auch wenn die Richtung noch dreht.
        if (gesture.mode === "scroll") {
          gesture = null;
          return;
        }
        // Ab hier folgt das Sheet dem Finger 1:1 — gemessen ab JETZT. Vorher
        // lief die Rechnung ab dem Aufsetzpunkt, und das Sheet stand, bis
        // der Finger die Tap-Schwelle überschritt, und sprang dann um genau
        // diese Pixel nach: ein spürbares Rucken zu Beginn jedes Wischs.
        gesture.startY = touch.clientY;
        if (!gesture.gefangen) gesture.startHeight = greife(gesture.heights);
        haeltRef.current = true;
        setZieht(true);
      }

      if (e.cancelable) e.preventDefault();
      if (Math.abs(gesture.aufsetzY - touch.clientY) > DRAG_TAP_THRESHOLD_PX) {
        suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESSION_MS;
      }
      const roh = gesture.startHeight + (gesture.startY - touch.clientY);
      gesture.height = clampSheetHeight(roh, gesture.heights);
      gesture.proben.push({ t: performance.now(), h: roh });
      if (gesture.proben.length > 12) gesture.proben.shift();

      // Über die Vollhöhe hinaus scrollt derselbe Zug den Inhalt weiter,
      // statt am Gummiband zu hängen: aus Peek in einem Zug bis tief in die
      // Liste, und aus der offenen Liste zurück, ohne abzusetzen. Erst wenn
      // der Inhalt am Ende ist, dehnt sich das Sheet.
      const voll = sheetSnapHeights(gesture.heights).voll;
      const { scroller } = gesture;
      if (scroller) {
        const gewollt = gesture.scrollStart + Math.max(0, roh - voll);
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = Math.min(gewollt, maxScroll);
        if (roh > voll) {
          schreibeHoehe(voll + Math.max(0, gewollt - maxScroll), gesture.heights);
          return;
        }
      }
      // Angezeigt wird die gedehnte Höhe, eingerastet wird nach der echten.
      schreibeHoehe(roh, gesture.heights);
    }

    function onTouchEnd() {
      settle();
    }

    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", onTouchEnd);
    sheet.addEventListener("touchcancel", onTouchEnd);
    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", onTouchEnd);
      sheet.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [messeHoehen, greife, einrasten, nachlaufen, schreibeHoehe]);

  // Der Griff beschreibt, was seine Aktivierung tut — und die führt nie nach
  // unten aus dem Blickfeld (siehe nextSnapOnTap): aus "versteckt" und "peek"
  // geht es hinauf, nur aus "voll" wieder zurück auf Peek.
  // DREI RASTPUNKTE, DREI NAMEN. Vorher hiess der Griff in "versteckt" und
  // in "peek" gleich ("Details ausklappen") und meldete beide Male
  // aria-expanded="false" — der Unterschied zwischen einem eingeklappten
  // Sheet und einer halb offenen Vorschau war für Hilfstechnik also gar
  // nicht vorhanden, und der Zustandswechsel per Pfeiltaste blieb stumm.
  // Jetzt benennt jeder Zustand seine eigene Handlung: aus "versteckt"
  // holt der Griff das Sheet zurück, aus "peek" zieht er es ganz auf.
  const handleLabel =
    snap === "voll"
      ? handleLabels.collapse
      : snap === "peek"
        ? `${handleLabels.expand} (ganz)`
        : handleLabels.expand;

  return (
    <div
      ref={sheetRef}
      onClickCapture={(e) => {
        if (Date.now() > suppressClickUntilRef.current) return;
        suppressClickUntilRef.current = 0;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`absolute inset-x-0 bottom-[var(--bottom-nav-h)] z-10 flex h-[var(--sheet-h)] flex-col overflow-hidden rounded-t-lg border-t border-border bg-background shadow-overlay md:contents ${className}`}
      // Nur der Startwert fürs erste Bild (das Sheet beginnt auf Peek). Danach
      // gehört `--sheet-h` der Geste und der Feder — siehe laufZu() —, und
      // React fasst den Wert nicht mehr an, solange peekPx gleich bleibt.
      style={{ "--sheet-h": `${peekPx}px` } as CSSProperties}
    >
      <div
        ref={handleRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        tabIndex={0}
        aria-label={handleLabel}
        aria-expanded={snap === "voll"}
        // Nennt den Bereich, den der Griff auf- und zuzieht — ohne ihn ist
        // "Details ausklappen" eine Handlung ohne Gegenstand.
        aria-controls={inhaltId}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSnap(nextSnapOnTap);
            return;
          }
          // Die Pfeiltasten sind der einzige Weg, das Sheet ohne Wischgeste
          // ganz aus dem Weg zu räumen — ein Tap holt es bewusst nur zurück.
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSnap((current) => snapStep(current, 1));
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSnap((current) => snapStep(current, -1));
          }
        }}
        // py-5 um eine 4-px-Pille: 44 px Griff statt 36. Und die Pille statt
        // des Sechs-Punkte-Symbols: das Punkteraster las sich im Test als
        // "weitere Aktionen", die Pille ist das Zeichen, das iOS und Android
        // für "zieh mich" verwenden.
        className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded-t-lg py-5 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset md:hidden"
      >
        <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border-strong" />
      </div>
      {/* display:contents, damit der Wrapper das Layout in keiner Breite
          verändert — weder die Flex-Spalte des Sheets noch, ab md, das
          Hochrutschen des Inhalts als direktes Flex-Kind von <main>. Er
          existiert allein für `inert`: weggeschnittener Inhalt bliebe sonst
          per Tab erreichbar. */}
      {hatKompakt && snap === "versteckt" && !zieht && (
        <button
          type="button"
          onClick={() => setSnap("peek")}
          aria-label={handleLabels.expand}
          className="flex h-14 w-full shrink-0 items-center gap-3 px-5 text-left md:hidden"
        >
          {kompakt}
        </button>
      )}
      <div id={inhaltId} className="contents" inert={istSheet && snap === "versteckt"}>
        {children}
      </div>
    </div>
  );
}
