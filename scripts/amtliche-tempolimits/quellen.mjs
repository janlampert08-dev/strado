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
// rang: bei Überschneidungen gewinnt der kleinere Rang.
//   1  kommunale Liniendaten — am genauesten
//   2  kantonale Liniendaten (meist nur Kantonsstrassen) und Genf
//   3  Lärmkataster, die die signalisierte Geschwindigkeit ausdrücklich
//      führen — dieselbe Zahl, aber als Modelleingang erhoben
//   4  Zonen-Flächen — sagen nichts über eine Strasse, die nur am Rand
//      vorbeiführt
//   5  Lärmkataster, deren Geschwindigkeit nicht als signalisiert deklariert
//      ist (GR) — die Werte sehen danach aus, belegt ist es nicht
//   9  OpenStreetMap
//
// art: "linie" wird über den Abstand zur Achse abgeglichen, "zone" darüber,
// ob der Streckenpunkt deutlich innerhalb der Fläche liegt.
//
// amtlich: false nur für OpenStreetMap — die einzige Quelle, die das ganze
// Land abdeckt, aber eben keine Behörde ist. Ihre Werte füllen die Lücken
// (Wallis, Tessin, Waadt, Berner Oberland), zählen aber nicht in den
// amtlichen Anteil und stehen im Rang hinter jeder Behördenquelle.

import {
  arcgis,
  geojsonDownload,
  geopackageZip,
  opendatasoft,
  overpassMaxspeed,
  wfsGeoJson,
  wfsGeoJsonWgs84,
  wfsGml,
} from "./laden.mjs";

const OPEN = "opendata.swiss, Nutzungsbedingung «Open use»";
const OPEN_BY = "opendata.swiss, Nutzungsbedingung «Open use. Must provide the source»";

export const QUELLEN = [
  // --- Schweiz, nicht amtlich ----------------------------------------------
  {
    id: "osm",
    name: "OpenStreetMap maxspeed",
    traeger: "OpenStreetMap-Mitwirkende",
    gebiet: "ganze Schweiz, Strassen mit maxspeed-Tag",
    datensatz: "https://www.openstreetmap.org",
    lizenz: "ODbL 1.0 — Namensnennung «© OpenStreetMap-Mitwirkende» nötig",
    amtlich: false,
    art: "linie",
    rang: 9,
    laden: overpassMaxspeed(),
  },

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
    rang: 4,
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
    rang: 3,
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
    rang: 4,
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
    rang: 4,
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
    rang: 3,
    laden: wfsGeoJsonWgs84({
      url: "https://wfs.geo.sh.ch/wfs",
      typename: "sh.verkehr.laermbelastung.haupt_uebrigestrassen.linie.strassenachse",
      format: "application/json",
      kmh: (p) => Number(p.signalisierte_geschwindigkeit_am_tag_kmh) || null,
    }),
  },


  // --- Lärmkataster: dieselbe signalisierte Geschwindigkeit, als Eingang
  // der Lärmberechnung erhoben. Oft die einzige Quelle, die auch
  // Gemeindestrassen abdeckt.
  {
    id: "sg-laerm",
    name: "Strassenlärmbelastungskataster: Lärmemission",
    traeger: "Kanton St. Gallen",
    gebiet: "Kantons- und Gemeindestrassen SG (inkl. Stadt St. Gallen)",
    datensatz: "https://services.geo.sg.ch/wss/service/SG00164_WFS/guest",
    lizenz: OPEN,
    art: "linie",
    rang: 3,
    // Zwei Seiten, und die zweite braucht eine Eigenheit des Servers: er
    // deckelt die erste Anfrage bei 10 000 und liefert ab STARTINDEX=10000
    // nur dann den Rest (10 944), wenn COUNT klein ist — mit COUNT=10000
    // oder ganz ohne COUNT kommen null Objekte zurück.
    laden: async () => {
      const seiten = [0, 10000].map((start) =>
        wfsGeoJsonWgs84({
          url: "https://services.geo.sg.ch/wss/service/SG00164_WFS/guest",
          typename: "SG00164:Laermemission",
          format: "GEOJSON",
          version: "2.0.0",
          zusatz: { STARTINDEX: String(start), COUNT: start === 0 ? "10000" : "5" },
          kmh: (p) => p.Signalisierte_Geschwindigkeit_Tag__km_h_,
        })(),
      );
      return (await Promise.all(seiten)).flat();
    },
  },
  {
    id: "tg-laerm",
    name: "Strassen-Lärm-Emissions-Kataster (SLEK)",
    traeger: "Kanton Thurgau",
    gebiet: "Staatsstrassen TG",
    datensatz: "https://ows.geo.tg.ch/geofy_access_proxy/laermemissionskataster",
    lizenz: OPEN,
    art: "linie",
    rang: 3,
    laden: wfsGeoJson({
      url: "https://ows.geo.tg.ch/geofy_access_proxy/laermemissionskataster",
      typename: "ms:Strassenlaermemission_Achse",
      format: "geojson",
      seite: 10000,
      kmh: (p) => Number(p.day_street_signaled_speed) || null,
    }),
  },
  {
    id: "lu-laerm",
    name: "Strassenlärmkataster 2018: Emissionsstrecken",
    traeger: "Kanton Luzern",
    // ART_ERH_GES = 1 heisst "signalisierte Geschwindigkeit"; alles andere
    // ist ein Mittelwert und fällt weg. 35 km/h gibt es nicht — Datenfehler.
    gebiet: "Kantons- und Gemeindestrassen LU (inkl. Stadt Luzern), Stand 2018",
    stand: "2018-01-01",
    datensatz: "https://public.geo.lu.ch/ogd/rest/services/managed/SLKAT18X_COL_V2_MP/MapServer/5",
    lizenz: "Open-BY (geoportal.lu.ch/Nutzungsbedingungen)",
    art: "linie",
    rang: 3,
    laden: arcgis({
      layerUrl: "https://public.geo.lu.ch/ogd/rest/services/managed/SLKAT18X_COL_V2_MP/MapServer/5",
      feld: "VT_STR",
      felder: "VT_STR,ART_ERH_GES",
      seite: 2000,
      kmh: (wert, attr) => (attr.ART_ERH_GES === 1 && wert !== 35 ? Number(wert) : null),
    }),
  },
  {
    id: "ur-laerm",
    name: "Strassenverkehrslärm: Emissionen IST (Tag)",
    traeger: "Kanton Uri (LISAG)",
    gebiet: "Kantons- und Hauptstrassen UR",
    datensatz: "https://opendata.swiss/de/dataset/larmbelastungskataster-strassen-tag-ur",
    lizenz: OPEN,
    art: "linie",
    rang: 3,
    laden: wfsGeoJson({
      url: "https://geo.ur.ch/wfs",
      typename: "umwelt:strassenlaerm_emissionen_tag_ist",
      kmh: (p) => p.vsig,
    }),
  },
  {
    id: "gr-laerm",
    name: "Strassenlärmkataster: Strasseneigentümer 2019",
    traeger: "Kanton Graubünden",
    // Das Feld heisst nur "speed_2019"; dass es die Signalisation ist, sagt
    // keine Beschreibung. Dafür spricht, dass Kanton und Gemeinden
    // ausschliesslich zulässige Signalwerte tragen — die Ausreisser (90,
    // 110) stehen alle auf der A13 des Bundes und fallen hier weg. Bis das
    // der Kanton bestätigt: nicht als amtlich ausgewiesen.
    gebiet: "Kantons- und Gemeindestrassen GR (inkl. Chur), Stand 2019",
    stand: "2019-01-01",
    datensatz: "https://map.geo.gr.ch",
    lizenz: "nicht angegeben (öffentlich abrufbar über map.geo.gr.ch)",
    amtlich: false,
    art: "linie",
    rang: 5,
    laden: wfsGml({
      url: "https://map.geo.gr.ch/mapserv_proxy?ogcserver=Kanton%20Graub%C3%BCnden%2C%20L%C3%A4rmbelastungskataster%20Strassen",
      typename: "ms:Strasseneigentuemer_2019",
      attribut: "speed_2019",
      ausschluss: (block) => /<ms:ktst_eig>Bund</.test(block),
    }),
  },

  // --- Weitere Gemeinden ----------------------------------------------------
  {
    id: "emmen",
    name: "Signalisierte Höchstgeschwindigkeiten Emmen",
    traeger: "Gemeinde Emmen",
    gebiet: "Gemeinde Emmen (LU), alle Strassen",
    datensatz: "https://opendata.swiss/de/dataset/signalisierte-geschwindigkeiten-emmen",
    lizenz: OPEN,
    art: "linie",
    rang: 1,
    laden: wfsGeoJsonWgs84({
      url: "https://gis.gict.ch/ows/emmen_admin/WMS_Emmen_all_pub",
      typename: "Signalisierte_Höchstgeschwindigkeiten",
      format: "GeoJSON",
      kmh: (p) => p.tempo,
    }),
  },
  {
    id: "winterthur-zonen",
    name: "Verkehrsberuhigte Zonen Winterthur",
    traeger: "Stadt Winterthur",
    gebiet: "Stadt Winterthur",
    datensatz: "https://stadtplan.winterthur.ch",
    lizenz: "nicht angegeben",
    art: "zone",
    rang: 4,
    randM: 15,
    laden: wfsGml({
      url: "https://stadtplan.winterthur.ch/wms/VerkehrsberuhigteZonen",
      typename: "ms:VerkehrsberuhigteZone",
      attribut: "Tempozone",
      flaeche: true,
      kmh: (t) => (/begegnung/i.test(t) ? 20 : /30/.test(t) ? 30 : null),
    }),
  },
  {
    id: "bl-zonen",
    name: "Tempo-30- und Begegnungszonen Basel-Landschaft",
    traeger: "Kanton Basel-Landschaft",
    gebiet: "Gemeinden BL",
    datensatz: "https://geowms.bl.ch",
    lizenz: "nicht angegeben",
    art: "zone",
    rang: 4,
    randM: 15,
    laden: async () => [
      ...(await wfsGml({ url: "https://geowms.bl.ch/", typename: "ms:verkehr_tempo30_zonen", flaeche: true, kmh: () => 30 })()),
      ...(await wfsGml({ url: "https://geowms.bl.ch/", typename: "ms:verkehr_begegnungszonen", flaeche: true, kmh: () => 20 })()),
    ],
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
