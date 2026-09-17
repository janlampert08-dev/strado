// Verzeichnis der amtlichen Tempolimit-Daten in der Schweiz.
//
// Es gibt keinen nationalen Datensatz: signalisierte Geschwindigkeiten
// verfügen Kantone und Gemeinden, und nur ein Teil von ihnen veröffentlicht
// sie als offene Geodaten. Diese Liste ist der Stand der Recherche vom
// 2026-09-17 (opendata.swiss, geocat.ch, geodienste.ch, geo.admin.ch,
// kantonale Geoportale); jeder
// Eintrag wurde live abgefragt. Wo ein Kanton fehlt, gibt es keinen
// maschinenlesbaren, frei zugänglichen Datensatz — siehe
// docs/amtliche-tempolimits.md für die Lücken und die Begründung.
//
// rang: bei Überschneidungen gewinnt der kleinere Rang. Kommunale
// Liniendaten (1) sind am genauesten, kantonale Linien (2) decken meist nur
// Kantonsstrassen ab, Zonen-Flächen (3) sagen nichts über eine Strasse, die
// nur am Rand vorbeiführt.
//
// art: "linie" wird über den Abstand zur Achse abgeglichen, "zone" darüber,
// ob der Streckenpunkt deutlich innerhalb der Fläche liegt.

import { arcgis, geojsonDownload, geopackageZip, opendatasoft, wfsGeoJson, wfsGeoJsonWgs84, wfsGml } from "./laden.mjs";

const OPEN = "opendata.swiss, Nutzungsbedingung «Open use»";
const OPEN_BY = "opendata.swiss, Nutzungsbedingung «Open use. Must provide the source»";

export const QUELLEN = [
  // --- Kanton Zürich -------------------------------------------------------
  {
    id: "zh",
    name: "Signalisierte Geschwindigkeit Kantonsstrassen",
    traeger: "Kanton Zürich, Tiefbauamt",
    gebiet: "Kantonsstrassen ZH (ohne Städte Zürich und Winterthur)",
    datensatz: "https://opendata.swiss/de/dataset/signalisierte-geschwindigkeit",
    lizenz: OPEN,
    art: "linie",
    rang: 2,
    laden: wfsGeoJson({
      url: "https://maps.zh.ch/wfs/TBAGeschZHWFS",
      typename: "ms:geschwindigkeit",
      kmh: (p) => p.geschw,
    }),
  },
  {
    id: "zh-zonen",
    name: "Tempo-30- und Begegnungszonen (verfügt)",
    traeger: "Kanton Zürich, Amt für Mobilität",
    gebiet: "Gemeinden ZH",
    datensatz: "https://opendata.swiss/de/dataset/tempo30-und-begegnungszonen-verfugt",
    lizenz: OPEN,
    art: "zone",
    rang: 3,
    randM: 15,
    laden: wfsGeoJson({
      url: "https://maps.zh.ch/wfs/OGDZHWFS",
      typename: "ms:ogd-0065_giszhpub_ogd_tempo_30_20_f",
      kmh: (p) => (/begegnung/i.test(p.zone_kt) ? 20 : /30/.test(p.zone_kt) ? 30 : null),
    }),
  },
  {
    id: "stadt-zuerich",
    name: "Signalisierte Geschwindigkeiten",
    traeger: "Stadt Zürich, Dienstabteilung Verkehr",
    gebiet: "Stadt Zürich, alle Strassen",
    datensatz: "https://data.stadt-zuerich.ch/dataset/geo_signalisierte_geschwindigkeiten",
    lizenz: OPEN,
    art: "linie",
    rang: 1,
    laden: wfsGeoJson({
      url: "https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Signalisierte_Geschwindigkeiten",
      typename: "view_geoserver_tempo_ist",
      version: "1.1.0",
      format: "GeoJSON",
      seite: 10000,
      // "T30", "T50N30" (Tag 50, Nacht 30), "T30N0" (nachts Fahrverbot),
      // "T0" (Fahrverbot). Massgebend ist der Tageswert.
      kmh: (p) => {
        const tag = Number(/^T(\d+)/.exec(p.temporegime_technical ?? "")?.[1]);
        return tag > 0 ? tag : null;
      },
    }),
  },

  // --- Kanton Bern ---------------------------------------------------------
  {
    id: "stadt-bern",
    name: "Signalisierte Höchstgeschwindigkeit",
    traeger: "Stadt Bern, Verkehrsplanung",
    gebiet: "Stadt Bern",
    datensatz: "https://opendata.swiss/de/dataset/signalisierte-hochstgeschwindigkeit",
    lizenz: OPEN,
    art: "linie",
    rang: 1,
    laden: arcgis({
      layerUrl: "https://map.bern.ch/arcgis/rest/services/Geoportal/Signalisierte_Hoechstgeschwindigkeit/MapServer/0",
      feld: "V_sig",
    }),
  },
  {
    id: "biel",
    name: "Geschwindigkeitsregime",
    traeger: "Stadt Biel, Infrastruktur und Mobilität",
    gebiet: "Stadt Biel/Bienne",
    datensatz: "https://opendata.swiss/de/dataset/geschwindigkeitsregime",
    lizenz: OPEN,
    art: "linie",
    rang: 1,
    laden: geojsonDownload({
      url: "https://sig.biel-bienne.ch/datastore/E312_Geschwindigkeitsregime-Limitation_de_vitesse/e312_geschwindigkeitsregime.json",
      schluessel: "e312_geschwindigkeitsregime",
      kmh: (p) => p.geschwindigkeitsregim,
    }),
  },

  // --- Zentralschweiz ------------------------------------------------------
  {
    id: "ur",
    name: "Geschwindigkeit Kantonsstrassen",
    traeger: "Kanton Uri (LISAG)",
    gebiet: "Kantonsstrassen UR",
    datensatz: "https://opendata.swiss/de/dataset/geschwindigkeit-kantonsstrasse",
    lizenz: OPEN,
    art: "linie",
    rang: 2,
    laden: wfsGeoJson({
      url: "https://geo.ur.ch/wfs",
      typename: "strassen:ur041_kantonsstrassen_geschwindigkeit",
      kmh: (p) => p.geschwindigkeit,
    }),
  },
  {
    id: "ur-gemeinden",
    name: "Geschwindigkeit Gemeindestrassennetz",
    traeger: "Kanton Uri (LISAG)",
    gebiet: "Gemeindestrassen UR",
    datensatz: "https://opendata.swiss/de/dataset/geschwindigkeit-gemeindestrassennetz",
    lizenz: OPEN,
    art: "linie",
    rang: 1,
    laden: wfsGeoJson({
      url: "https://geo.ur.ch/wfs",
      typename: "strassen:ur043_gemeindestrassennetz_geschwindigkeit",
      kmh: (p) => p.tempo,
    }),
  },
  {
    id: "sz",
    name: "Geschwindigkeitsbereiche",
    traeger: "Kanton Schwyz, Amt für Geoinformation",
    gebiet: "Kanton Schwyz (Geschwindigkeitsbereiche)",
    datensatz: "https://opendata.swiss/de/dataset/geschwindigkeitsbereiche",
    lizenz: OPEN_BY,
    art: "linie",
    rang: 2,
    laden: wfsGml({
      url: "https://map.geo.sz.ch/mapserv_proxy",
      typename: "ch.sz.a115a.geschwindigkeitsbereich",
      attribut: "geschwindigkeit_ui",
    }),
  },

  {
    id: "lu",
    name: "Kantonsstrassen: Geschwindigkeitslimiten",
    traeger: "Kanton Luzern, Verkehr und Infrastruktur",
    gebiet: "Kantonsstrassen LU",
    datensatz: "https://daten.geo.lu.ch/api/stac/v1.0/collections/KSTRGLIM_DS_V1",
    lizenz: "Open-BY (geoportal.lu.ch/Nutzungsbedingungen)",
    art: "linie",
    rang: 2,
    laden: geopackageZip({
      url: "https://download.geo.lu.ch/api/stac/v1.0/downloads/KSTRGLIM_DS_V1/KSTRGLIM_DS/KSTRGLIM_DS_V1_gpkg.zip",
      tabelle: "KSTRGLIM_V1_LI",
      feld: "GESCHW",
    }),
  },
  {
    id: "zg",
    name: "Strassenlärmkataster: Emissionen alle Linien",
    traeger: "Kanton Zug, Amt für Umwelt",
    // Kein eigener Tempolimit-Datensatz; der Lärmkataster führt die
    // signalisierte Geschwindigkeit je Abschnitt mit. Übernommen werden nur
    // Abschnitte mit signaled_speed = true — die anderen tragen einen
    // Modellwert.
    gebiet: "Kantons- und Gemeindestrassen ZG (Lärmkataster)",
    datensatz: "https://services.geo.zg.ch/ows/strassenlaermkataster",
    lizenz: "Kanton Zug, Geodienste (Nutzungsbedingungen zg.ch)",
    art: "linie",
    rang: 2,
    laden: wfsGeoJsonWgs84({
      url: "https://services.geo.zg.ch/ows/strassenlaermkataster",
      typename: "zg_emissionen_alle_linien",
      format: "application/vnd.geo+json",
      kmh: (p) => (p.signaled_speed === true || p.signaled_speed === "True" ? p.day_street_signaled_speed : null),
    }),
  },

  // --- Nordwestschweiz ----------------------------------------------------
  {
    id: "so",
    name: "Signalisierte Geschwindigkeiten (Kantonsstrassen)",
    traeger: "Kanton Solothurn, Amt für Verkehr und Tiefbau",
    gebiet: "Kantonsstrassen SO",
    datensatz: "https://geo.so.ch/api/data/v1/ch.so.avt.kantonsstrassen.sig_geschwindigkeiten/",
    lizenz: "Opendata OPEN: Freie Nutzung",
    art: "linie",
    rang: 2,
    // Nicht im WFS, nur über die Data-API; die bbox umfasst den ganzen Kanton.
    laden: geojsonDownload({
      url: "https://geo.so.ch/api/data/v1/ch.so.avt.kantonsstrassen.sig_geschwindigkeiten/?bbox=2590000,1210000,2650000,1270000",
      kmh: (p) => p.max_geschw,
    }),
  },
  {
    id: "ag",
    name: "Signalisierte Geschwindigkeit",
    traeger: "Kanton Aargau, Departement Bau, Verkehr und Umwelt",
    // Die Datei heisst atb_geschw_20170101: Datenstand 1. Januar 2017. Neuere
    // Signalisationen fehlen — trotzdem amtlich und näher an der Wahrheit als
    // ein fehlendes OSM-maxspeed-Tag, daher mit dem niedrigsten Linienrang.
    stand: "2017-01-01",
    gebiet: "Kantonsstrassen AG",
    datensatz: "https://opendata.swiss/de/dataset/signalisierte-geschwindigkeit1",
    lizenz: "Nutzungsbedingungen AGIS für öffentlich zugängliche Geodaten",
    art: "linie",
    rang: 2,
    laden: geopackageZip({
      url: "https://api.geo.ag.ch/v1/data/downloads/AGIS.atb_geschw/download/GeoPackage/kanton_aargau",
      feld: "Geschw",
    }),
  },
  {
    id: "bs-zonen",
    name: "Verkehrsberuhigte Zonen: Tempo-30- und Begegnungszonen",
    traeger: "Kanton Basel-Stadt, Amt für Mobilität",
    gebiet: "Kanton Basel-Stadt",
    datensatz: "https://opendata.swiss/de/dataset/tempo-30-zone",
    lizenz: OPEN,
    art: "zone",
    rang: 3,
    randM: 15,
    laden: async () => [
      ...(await wfsGeoJson({ url: "https://wfs.geo.bs.ch/", typename: "ms:VR_Tempo30Zone", format: "geojson", kmh: () => 30 })()),
      ...(await wfsGeoJson({ url: "https://wfs.geo.bs.ch/", typename: "ms:VR_Begegnungszone", format: "geojson", kmh: () => 20 })()),
    ],
  },

  // --- Ostschweiz ---------------------------------------------------------
  {
    id: "stadt-st-gallen-zonen",
    name: "Tempo 30-Zonen Stadt St.Gallen",
    traeger: "Stadt St. Gallen",
    gebiet: "Stadt St. Gallen",
    datensatz: "https://opendata.swiss/de/dataset/tempo-30-zonen2",
    lizenz: "CC BY 4.0",
    art: "zone",
    rang: 3,
    randM: 15,
    laden: opendatasoft({
      url: "https://daten.stadt.sg.ch/api/explore/v2.1/catalog/datasets/tempo-30-zonen/exports/geojson",
      kmh: () => 30,
    }),
  },

  {
    id: "gr",
    name: "Strassensignalisation: Signalisierte Höchstgeschwindigkeit",
    traeger: "Kanton Graubünden, Tiefbauamt",
    // Über den Karten-Proxy des Geoportals; ein dokumentierter WFS dazu
    // existiert nicht. Lizenz nicht angegeben.
    gebiet: "Haupt- und Verbindungsstrassen GR",
    datensatz: "https://map.geo.gr.ch",
    lizenz: "nicht angegeben (öffentlich abrufbar über map.geo.gr.ch)",
    art: "linie",
    rang: 2,
    laden: wfsGml({
      url: "https://map.geo.gr.ch/mapserv_proxy?ogcserver=Kanton+Graub%C3%BCnden%2C+Strassensignalisation",
      typename: "Signalisierte_Hoechstgeschwindigkeit",
      attribut: "tempo_limit",
    }),
  },
  {
    id: "sh",
    name: "Lärmbelastung Haupt- und übrige Strassen: Strassenachsen",
    traeger: "Kanton Schaffhausen",
    // Lärmkataster mit dem Attribut «signalisierte Geschwindigkeit am Tag».
    gebiet: "Haupt- und übrige Strassen SH (Lärmkataster)",
    datensatz: "https://wfs.geo.sh.ch/wfs",
    lizenz: "Kanton Schaffhausen, OGD",
    art: "linie",
    rang: 2,
    laden: wfsGeoJsonWgs84({
      url: "https://wfs.geo.sh.ch/wfs",
      typename: "sh.verkehr.laermbelastung.haupt_uebrigestrassen.linie.strassenachse",
      format: "application/json",
      kmh: (p) => Number(p.signalisierte_geschwindigkeit_am_tag_kmh) || null,
    }),
  },

  // --- Westschweiz --------------------------------------------------------
  {
    id: "ju",
    name: "Routes cantonales: axes routiers vitesse (SIN_9_26)",
    traeger: "République et Canton du Jura",
    gebiet: "Routes cantonales JU",
    datensatz: "https://geo.jura.ch/geodonnees/donnees/SIN_9_26_Routes_cantonales_et_points_du_systeme_de_reperage_rout.zip",
    lizenz: "Conditions d’utilisation des géodonnées JU",
    art: "linie",
    rang: 2,
    laden: wfsGml({
      url: "https://geo.jura.ch/mapserv_proxy?ogcserver=Main_PNG",
      typename: "sin_09_26_axes_routiers_vitesse",
      attribut: "vitesse",
    }),
  },
  {
    id: "fr",
    name: "Limitations de vitesse (routes cantonales)",
    traeger: "Canton de Fribourg, Service des ponts et chaussées",
    gebiet: "Routes cantonales FR",
    datensatz: "https://opendata.swiss/de/dataset/hochstgeschwindigkeiten",
    lizenz: OPEN,
    art: "linie",
    rang: 2,
    laden: arcgis({
      layerUrl: "https://maps.fr.ch/ags/rest/services/OpenData/Limitations_de_vitesse__routes_cantonales_/FeatureServer/0",
      feld: "VITESSE",
    }),
  },
  {
    id: "ge",
    name: "Limitations de vitesse",
    traeger: "Canton de Genève, Office cantonal des transports",
    // Flächen, die jeweils alle Strassen mit derselben Höchstgeschwindigkeit
    // umschliessen — flächendeckend für den ganzen Kanton, daher trotz
    // Zonen-Geometrie verlässlicher als die reinen Tempo-30-Zonen.
    gebiet: "Canton de Genève, toutes les routes",
    datensatz: "https://opendata.swiss/de/dataset/limitations-de-vitesse",
    lizenz: OPEN,
    art: "zone",
    rang: 2,
    randM: 0,
    laden: arcgis({
      layerUrl: "https://vector.sitg.ge.ch/arcgis/rest/services/OTC_LIMITATIONS_VITESSE/FeatureServer/0",
      feld: "VITESSE",
    }),
  },
];
