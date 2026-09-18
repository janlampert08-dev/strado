-- "Panoramastrasse" ist kein Passname.
--
-- 0107 hat den Begriff für den Glaubenbielen aufgenommen, weil die Strasse
-- dort so beschildert ist. Im Probelauf gegen den echten Feed hat genau er
-- einen falschen Treffer erzeugt: die Baustellenmeldung am Jaun-Pass nennt in
-- einer ihrer Sprachfassungen eine Panoramastrasse, und der Glaubenbielen —
-- 80 km entfernt — stand damit auf "eingeschränkt".
--
-- Der Begriff trägt zudem das Wort "Strasse" und kommt deshalb an der
-- Kontextregel in lib/passMeldungen.ts vorbei, die sonst ein "Pass" davor
-- verlangt. Ein Gattungswort, das auf tausend Strassen passt, ist als
-- Suchbegriff wertlos und als Treffer gefährlich.
update public.paesse
set suchbegriffe = '{Glaubenbielenpass,Glaubenbielen-Pass,Glaubenbielen,Glaubenbüelen}'
where id = 'glaubenbielen';
