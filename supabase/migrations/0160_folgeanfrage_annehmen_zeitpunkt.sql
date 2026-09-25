-- =====================================================================
-- 0160 — Angenommene Anfrage ist keine neue Meldung; Sammelannahme weg
-- =====================================================================
--
-- Zwei Befunde aus dem zweiten Code-Review vor dem Release (2026-09-25):
--
-- 1. folgeanfrage_annehmen (0146) legte die follows-Zeile mit
--    erstellt_am = now() an. Das liegt nach follows_gesehen_am, also zählte
--    count_unseen_activity den eben selbst angenommenen Follower als neue
--    Meldung: wer auf /aktivitaet eine Anfrage annahm, bekam dafür ein
--    Abzeichen in der Kopfleiste. Die Zeile übernimmt jetzt den Zeitpunkt
--    der Anfrage — der Follower steht damit auch an der Stelle der
--    Zeitachse, an der er tatsächlich gefragt hat.
--
-- 2. folgeanfragen_alle_annehmen (0146) ruft die App nicht mehr auf: das
--    Ausschalten der Bestätigung nimmt offene Anfragen nicht mehr an (ein
--    sofort speichernder Schalter, versehentlich umgelegt, hätte Fremde
--    unwiderruflich zu Followern gemacht). Die Funktion war aber weiter für
--    authenticated aufrufbar — dieselbe unumkehrbare Sammelannahme über die
--    API. Sie wird entfernt.
--
-- REIHENFOLGE: unabhängig vom Code; der aktuelle Code ruft die entfernte
-- Funktion nicht auf.
--
-- WEG ZURÜCK: folgeanfrage_annehmen und folgeanfragen_alle_annehmen aus 0146
-- neu anlegen (samt Grants).

create or replace function public.folgeanfrage_annehmen(p_von uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_angefragt_am timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  delete from public.folge_anfragen
   where von = p_von and an = auth.uid()
  returning erstellt_am into v_angefragt_am;

  if v_angefragt_am is null then
    return false;
  end if;

  insert into public.follows (follower_id, followed_id, erstellt_am)
  values (p_von, auth.uid(), v_angefragt_am)
  on conflict do nothing;

  return true;
end;
$$;

drop function public.folgeanfragen_alle_annehmen();
