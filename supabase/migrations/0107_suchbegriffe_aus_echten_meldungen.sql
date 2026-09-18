-- Die Suchbegriffe der Pässe, nachgezogen an der echten Lieferung des ASTRA.
--
-- 0104 hat sie geschätzt ("Sustenpass", "Gotthardpass"). Ein Probelauf gegen
-- den Feed — 13.7 MB, 890 Situationen — hat gezeigt, dass er Pässe anders
-- schreibt, nämlich mit Gattungswort und Bindestrich:
--
--   "H2 Airolo <-> Göschenen zwischen Pass Gotthard-Pass und Ortschaft …"
--   "Bulle <-> Reidenbach zwischen Pass Jaun-Pass und Ortschaft Reidenbach"
--   "Col Col du St-Gothard"  (französische Fassung derselben Meldung)
--
-- "Gotthardpass" kommt darin gar nicht vor. Umgekehrt haben die kurzen Formen
-- aus 0104 drei falsche Treffer erzeugt, weil Passnamen in der Schweiz auch
-- Dörfer und Strassen sind: "Anschluss Leuk/Susten-Ost" (Dorf Susten im
-- Wallis), "Route Du Simplon" und "Ortschaft Simplon-Dorf". Ein falscher
-- Treffer ist teuer — er sperrt eine offene Passstrasse in der Anzeige.
--
-- Zwei Konsequenzen, eine hier, eine im Code:
--   * Hier: die Bindestrich- und Fremdsprachenformen kommen dazu, die blossen
--     Ortsnamen fallen weg.
--   * lib/passMeldungen.ts verlangt zusätzlich, dass ein Begriff ohne eigenes
--     Gattungswort unmittelbar hinter "Pass"/"Col"/"Passo" steht. Beides
--     zusammen: der Katalog sagt, wie der Pass heisst, der Code verlangt den
--     Beleg, dass ein Pass gemeint ist.
--
-- Datenänderung, keine Schemaänderung.

update public.paesse set suchbegriffe = '{Umbrailpass,Umbrail-Pass,"Pass Umbrail","Giogo di Santa Maria","Passo Umbrail"}' where id = 'umbrail';
update public.paesse set suchbegriffe = '{Nufenenpass,Nufenen-Pass,"Passo della Novena","Col du Nufenen"}' where id = 'nufenen';
update public.paesse set suchbegriffe = '{"Grosser-St.-Bernhard-Pass","Grosser St. Bernhard-Pass","Col du Grand-Saint-Bernard","Col du Grand-St-Bernard","Colle del Gran San Bernardo"}' where id = 'grosser-st-bernhard';
update public.paesse set suchbegriffe = '{Furkapass,Furka-Pass,"Col de la Furka","Passo della Furka"}' where id = 'furka';
update public.paesse set suchbegriffe = '{Flüelapass,Flüela-Pass,"Pass dal Flüela","Col de la Flüela"}' where id = 'flueela';
update public.paesse set suchbegriffe = '{Berninapass,Bernina-Pass,"Passo del Bernina","Col de la Bernina"}' where id = 'bernina';
update public.paesse set suchbegriffe = '{Albulapass,Albula-Pass,"Pass d''Alvra","Passo dell''Albula"}' where id = 'albula';
update public.paesse set suchbegriffe = '{"Forcola di Livigno","Passo della Forcola"}' where id = 'forcola-di-livigno';
update public.paesse set suchbegriffe = '{Julierpass,Julier-Pass,"Pass dal Güglia","Passo del Giulia"}' where id = 'julier';
update public.paesse set suchbegriffe = '{Sustenpass,Susten-Pass,"Col du Susten","Passo del Susten"}' where id = 'susten';
update public.paesse set suchbegriffe = '{Grimselpass,Grimsel-Pass,"Col du Grimsel","Passo del Grimsel"}' where id = 'grimsel';
update public.paesse set suchbegriffe = '{Ofenpass,Ofen-Pass,"Pass dal Fuorn","Passo del Forno","Col du Fuorn"}' where id = 'ofen';
update public.paesse set suchbegriffe = '{Splügenpass,Splügen-Pass,"Passo dello Spluga","Col du Splügen"}' where id = 'spluegen';
update public.paesse set suchbegriffe = '{Gotthardpass,Gotthard-Pass,"Passo del San Gottardo","Col du St-Gothard","Col du Saint-Gothard",Tremola}' where id = 'gotthard';
update public.paesse set suchbegriffe = '{San-Bernardino-Pass,"San Bernardino-Pass","Passo del San Bernardino","Col du San Bernardino"}' where id = 'san-bernardino';
update public.paesse set suchbegriffe = '{Oberalppass,Oberalp-Pass,"Pass Alpsu","Col de l''Oberalp","Passo dell''Oberalp"}' where id = 'oberalp';
update public.paesse set suchbegriffe = '{Simplonpass,Simplon-Pass,"Col du Simplon","Passo del Sempione"}' where id = 'simplon';
update public.paesse set suchbegriffe = '{Klausenpass,Klausen-Pass,"Col du Klausen","Passo del Klausen"}' where id = 'klausen';
update public.paesse set suchbegriffe = '{Lukmanierpass,Lukmanier-Pass,"Passo del Lucomagno","Cuolm Lucmagn","Col du Lukmanier"}' where id = 'lukmanier';
update public.paesse set suchbegriffe = '{Malojapass,Maloja-Pass,"Passo del Maloja","Col de la Maloja"}' where id = 'maloja';
update public.paesse set suchbegriffe = '{"Col de la Croix"}' where id = 'col-de-la-croix';
update public.paesse set suchbegriffe = '{Wolfgangpass,Wolfgang-Pass,"Pass Wolfgang"}' where id = 'wolfgang';
update public.paesse set suchbegriffe = '{Glaubenbielenpass,Glaubenbielen-Pass,Glaubenbielen,Glaubenbüelen,Panoramastrasse}' where id = 'glaubenbielen';
update public.paesse set suchbegriffe = '{Pragelpass,Pragel-Pass,"Pass Pragel"}' where id = 'pragel';
update public.paesse set suchbegriffe = '{"Col du Pillon"}' where id = 'col-du-pillon';
update public.paesse set suchbegriffe = '{Glaubenbergpass,Glaubenberg-Pass,Glaubenberg}' where id = 'glaubenberg';
update public.paesse set suchbegriffe = '{"Col de la Forclaz","Forclaz-Pass"}' where id = 'col-de-la-forclaz';
update public.paesse set suchbegriffe = '{Jaunpass,Jaun-Pass,"Col du Jaun","Passo del Jaun"}' where id = 'jaun';
update public.paesse set suchbegriffe = '{"Col du Marchairuz"}' where id = 'col-du-marchairuz';
update public.paesse set suchbegriffe = '{"Col des Mosses","Pass Mosses"}' where id = 'col-des-mosses';
update public.paesse set suchbegriffe = '{Ibergeregg,Ibergeregg-Pass,"Pass Ibergeregg"}' where id = 'ibergeregg';
update public.paesse set suchbegriffe = '{"Vue des Alpes","Col de la Vue des Alpes","Pass Vue des Alpes"}' where id = 'vue-des-alpes';
update public.paesse set suchbegriffe = '{Sattelegg,Sattelegg-Pass,"Pass Sattelegg"}' where id = 'sattelegg';
update public.paesse set suchbegriffe = '{Brünigpass,Brünig-Pass,"Col du Brünig","Passo del Brünig"}' where id = 'bruenig';

-- Gegenprobe nach dem Einspielen (erwartet: 34 Zeilen, keine mit einem
-- Begriff, der ohne Gattungswort auskommt und zugleich ein Ortsname ist):
--   select id, suchbegriffe from public.paesse order by id;
