import Card from "@/components/ui/Card";
import { LEGAL_URLS } from "@/lib/constants";
import VerifiziertAbzeichen from "@/components/VerifiziertAbzeichen";

// Der Erklärungstext hinter dem Verifiziert-Abzeichen — einmal geschrieben,
// zweimal gezeigt: als Blatt direkt hinter dem Abzeichen
// (components/VerifiziertAbzeichen.tsx) und als Seite unter /verifiziert
// (kanonische Adresse für Suche und Teilen).
//
// Der Text ist an AGB Ziff. 12.4 gebunden: Zeiten in Bestenlisten sind
// dort ausdrücklich keine geeichte Zeitmessung. "Verifiziert" heisst also
// NICHT, dass die Anbieterin die Fahrt bestätigt hat — nie "bestätigt",
// "geprüft" oder "echt" behaupten. (Der Entwurf einer Ziff. 12.6, die die
// verifizierte Fahrt eigens definiert, liegt auf einem offenen Zweig und
// ist nicht in Kraft.)
//
// Bewusst ohne Zahlenwerk (Intervalle, Toleranzen): wer die Mechanik genau
// wissen will, liest die Migration. Hier steht, was jemand wissen muss, der
// gerade auf ein Abzeichen getippt hat.
export default function VerifiziertErklaerung() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        An jeder Fahrt mit einer Zeit steht eines dieser beiden Abzeichen. Es sagt, woher
        die Zeit kommt.
      </p>

      <div className="flex flex-wrap gap-3">
        <VerifiziertAbzeichen quelle="server" verlinkt={false} />
        <VerifiziertAbzeichen quelle="trail" verlinkt={false} />
      </div>

      <Card surface className="p-5">
        <h3 className="font-semibold">Wie Strado die Dauer misst</h3>
        <p className="mt-2 text-sm text-muted">
          Sobald die Zeitmessung beginnt, legt der Server einen Startpunkt an — bei einer
          Strecke also dann, wenn du den Startpunkt erreichst, nicht schon beim Antippen.
          Während der Fahrt meldet die App in kurzen Abständen deine Position. Jede dieser
          Meldungen bekommt ihren Zeitstempel vom Server, nicht von deinem Telefon.
        </p>
        <p className="mt-3 text-sm text-muted">
          Beim Speichern ist die gewertete Dauer die Spanne zwischen dem Start und der
          letzten Meldung. Zusätzlich muss diese letzte Meldung zum Ende deiner
          Aufzeichnung passen — sonst zählt die Zeit nicht.
        </p>
        <p className="mt-3 text-sm text-muted">
          Ausserdem müssen die Meldungen entlang der Strecke liegen, sie von Anfang bis
          Ende abdecken und dürfen nicht springen. Ein Tunnel, eine Pause oder ein paar
          Minuten, in denen dein Telefon die App schlafen legt, schaden nicht. Fehlt aber
          ein grosser Teil der Strecke, zählt die Zeit nicht.
        </p>
      </Card>

      <Card surface className="p-5">
        <h3 className="font-semibold">Warum das so gebaut ist</h3>
        <p className="mt-2 text-sm text-muted">
          Ein Telefon kann jede beliebige Uhrzeit behaupten. Wer eine echte Aufzeichnung
          nimmt und ihre Zeitstempel staucht, erzeugt eine Fahrt, die auf dem Papier
          stimmt und trotzdem nie so stattgefunden hat. Solange die Zeit allein vom Gerät
          kommt, ist jede Rangliste nur so viel wert wie das Vertrauen darin, dass
          niemand das tut.
        </p>
        <p className="mt-3 text-sm text-muted">
          Deshalb misst der Server mit. Eine Zeit, die hier in einer Rangliste steht,
          ist über ihre volle Länge beobachtet worden. Das gilt auch für automatisch
          erkannte Abschnitte innerhalb einer freien Fahrt: Decken die Positions&shy;meldungen
          den Abschnitt lückenlos ab, trägt er eine verifizierte Zeit wie eine
          direkt gestartete Streckenfahrt.
        </p>
      </Card>

      <Card surface className="p-5">
        <h3 className="font-semibold">Was es nicht heisst</h3>
        <p className="mt-2 text-sm text-muted">
          <strong className="text-foreground">Verifiziert heisst nicht bestätigt.</strong>{" "}
          Die gemeldeten Positionen kommen wie jede GPS-Angabe von deinem Gerät. Wer
          fälschen will, muss die Fahrt jetzt in Echtzeit nachstellen, statt eine Datei
          nachträglich zu bearbeiten — das ist eine deutlich höhere Hürde, aber kein
          Beweis. Strado behauptet nicht, deine Fahrt gesehen zu haben.
        </p>
        <p className="mt-3 text-sm text-muted">
          Und es ist keine geeichte Zeitmessung. Empfang, Gerät und Energiesparfunktionen
          beeinflussen jede Aufzeichnung.
        </p>
      </Card>

      <Card surface className="p-5">
        <h3 className="font-semibold">Wenn deine Fahrt nicht verifiziert ist</h3>
        <p className="mt-2 text-sm text-muted">
          Das ist kein Vorwurf und meistens schlicht ein Funkloch. Deine Fahrt bleibt
          vollständig erhalten: Distanz, Höhenmeter, Abdeckung, Fotos, Notiz — alles
          zählt und alles ist sichtbar. Nur die Zeit erscheint nicht in der Rangliste
          der Strecke.
        </p>
      </Card>

      <p className="text-sm text-muted">
        Die verbindliche Fassung steht in{" "}
        <a
          href={LEGAL_URLS.agb}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-ink underline underline-offset-2"
        >
          Ziff. 12.4 der AGB
        </a>
        .
      </p>
    </div>
  );
}
