-- Die Mengenbegrenzung für private Strecken am Schreibrand durchsetzen.
--
-- 0064 hat die Regel als Funktion bereitgestellt, und lib/actions/routes.ts
-- ruft sie beim Anlegen auf. Das deckt aber nur einen von zwei Wegen ab.
--
-- Der zweite: die Policy "Nutzer können eigene unverifizierte Strecken
-- bearbeiten" (0001) erlaubt der angemeldeten Person, ist_privat auf einer
-- eigenen, noch nicht freigegebenen Strecke selbst zu setzen. Ein direkter
-- PostgREST-Aufruf umgeht damit die Server Action und das Kontingent
-- vollständig — dieselbe Lücke, die AGENTS.md für route_completions
-- beschreibt: "eine Regel, die nur in der Anwendung steht, ist keine
-- Schranke".
--
-- Deshalb hier ein Trigger. Er sitzt dort, wo die Zeile tatsächlich
-- geschrieben wird, und gilt damit für jeden Weg: Server Action, direkter
-- PostgREST-Aufruf, künftige RPC.
--
-- Bewusst NUR der Übergang nicht-privat -> privat. Eine Strecke privat zu
-- LASSEN, sie zu veröffentlichen (publishPrivateRoute) oder sonst zu
-- bearbeiten bleibt unberührt — sonst wäre eine bestehende private Strecke
-- nach dem Ende eines Abos nicht mehr editierbar, und genau das sagt
-- AGB Ziff. 9.1 zu: Inhalte bleiben, nur das Neuanlegen ist begrenzt.

create or replace function public.private_strecke_kontingent_pruefen()
returns trigger
language plpgsql
as $$
declare
  v_ist_premium boolean;
  v_bestandsschutz boolean;
  v_anzahl integer;
  -- Spiegelt MAX_PRIVATE_STRECKEN_GRATIS in lib/premiumLimits.ts und
  -- v_grenze in darf_private_strecke_anlegen() (0064). Drei Stellen, eine
  -- Zahl — wer sie ändert, ändert eine in den AGB (Ziff. 3.2) zugesagte
  -- Leistung und muss alle drei mitziehen.
  v_grenze constant integer := 1;
begin
  -- Nur der Übergang in den privaten Zustand ist begrenzt.
  if not new.ist_privat then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.ist_privat then
    return new;
  end if;

  -- Ohne Eigentümer gibt es kein Kontingent, gegen das zu prüfen wäre.
  -- Betrifft nur Altbestand: erstellt_von ist nullable.
  if new.erstellt_von is null then
    return new;
  end if;

  -- Serialisiert pro Konto: ohne die Sperre kämen zwei gleichzeitige
  -- Anfragen beide durch, weil beide dieselbe Anzahl sehen. Dieselbe
  -- Technik wie in apply_subscription_state (0059).
  perform pg_advisory_xact_lock(hashtextextended('private_strecken:' || new.erstellt_von::text, 0));

  select p.ist_premium into v_ist_premium
  from public.profiles p
  where p.id = new.erstellt_von;

  if coalesce(v_ist_premium, false) then
    return new;
  end if;

  select exists (
    select 1 from public.private_strecken_bestandsschutz b
    where b.user_id = new.erstellt_von
  ) into v_bestandsschutz;

  if v_bestandsschutz then
    return new;
  end if;

  -- Die Zeile, die gerade geschrieben wird, zählt nicht mit: beim UPDATE
  -- steht sie schon in der Tabelle (noch mit ist_privat = false), beim
  -- INSERT noch nicht. Ohne den Ausschluss wäre die Grenze je nach Weg um
  -- eins verschoben.
  select count(*)::integer into v_anzahl
  from public.routes r
  where r.erstellt_von = new.erstellt_von
    and r.ist_privat
    and r.id <> new.id;

  if v_anzahl >= v_grenze then
    raise exception 'private_strecken_kontingent_erschoepft'
      using hint = 'Ohne Premium ist eine private Strecke möglich.';
  end if;

  return new;
end;
$$;

-- security definer, ausdrücklich und mit Begründung: der Trigger liest
-- private_strecken_bestandsschutz und zählt ALLE privaten Strecken des
-- Kontos. Als Aufrufer wäre beides von RLS gefiltert — die Zählung sähe nur
-- die sichtbaren Zeilen und liesse sich damit unterlaufen. Eine Schranke,
-- die weniger sieht als sie schützen soll, ist keine.
--
-- Die üblichen Auflagen sind eingehalten: search_path gepinnt, keine
-- Parameter, keine Entscheidung anhand unauthentifizierter Eingaben — der
-- Trigger liest ausschliesslich new.erstellt_von aus der Zeile, die die
-- INSERT/UPDATE-Policy ohnehin schon auf das eigene Konto beschränkt hat.
alter function public.private_strecke_kontingent_pruefen() security definer;
alter function public.private_strecke_kontingent_pruefen() set search_path = public, pg_temp;

drop trigger if exists private_strecke_kontingent on public.routes;
create trigger private_strecke_kontingent
  before insert or update of ist_privat on public.routes
  for each row
  execute function public.private_strecke_kontingent_pruefen();
