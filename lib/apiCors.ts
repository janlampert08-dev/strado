// Antwort-Header der öffentlichen Strecken-API (app/api/strecken/route.ts und
// app/api/strecken/[id]/route.ts).
//
// Serverseitig war diese API immer für jeden abrufbar — sie ist bewusst
// unauthentifiziert und liefert nur, was RLS einem anonymen Leser ohnehin
// zeigt: freigegebene, nicht private Strecken. Im Browser scheiterte ein
// Abruf von einer fremden Seite trotzdem, weil die Same-Origin-Policy die
// Antwort ohne CORS-Header nicht herausgibt. Genau das trifft die
// Info-Seite: sie liegt auf strado.ch, die App auf app.strado.ch.
//
// "*" statt einer Origin-Liste, weil der Endpunkt für fremde Clients
// gedacht ist (siehe Kommentar in app/api/strecken/route.ts) und eine Liste
// hier nichts schützen würde: wer die Daten will, holt sie serverseitig ohne
// jeden Browser. Entscheidend ist, was NICHT dabeisteht:
// Access-Control-Allow-Credentials. Ohne diesen Header — und mit "*" ginge
// er ohnehin nicht — schickt der Browser weder Cookies noch
// Authorization-Kopf mit, die Antwort hängt also an keiner Sitzung und
// enthält nie mehr als die anonyme Sicht. Wer hier je auf eine Origin-Liste
// umstellt, muss das so lassen.
//
// Kein Access-Control-Allow-Methods/-Headers und kein OPTIONS-Handler: ein
// GET ohne eigene Kopfzeilen ist eine "einfache Anfrage" und löst keinen
// Preflight aus. Wer der Anfrage einen eigenen Header mitgibt, braucht hier
// beides — dann aber bewusst.
export const OEFFENTLICHE_API_HEADER = Object.freeze({
  "Access-Control-Allow-Origin": "*",
});
