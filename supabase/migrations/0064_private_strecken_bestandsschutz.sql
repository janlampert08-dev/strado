-- Private Strecken: Freikontingent 1, Bestandsschutz für alle, die heute
-- schon mehr haben.
--
-- Ausgangslage: private Strecken (routes.ist_privat) stehen seit 0021 allen
-- offen, weil das Premium-Gating in lib/actions/routes.ts abgeschaltet wurde.
-- Sie sind zugleich das einzige Feature mit echtem Premium-Charakter
-- (docs/premium-plan.md, Abschnitt 4).
--
-- Der Plan schränkt hier als einziger Stelle etwas ein, was heute offen ist.
-- Kernregel 16 verbietet, Geschäftsregeln still zu ändern — deshalb steht
-- die Regel hier ausdrücklich und vollständig:
--
--   1. Premium: unbegrenzt.
--   2. Ohne Premium: EINE private Strecke. Nicht null, damit die Funktion
--      ohne Abo erlebbar bleibt und nicht bloss als gesperrtes Symbol
--      dasteht.
--   3. BESTANDSSCHUTZ: Wer zum Stichtag dieser Migration mehr als eine
--      private Strecke hat, behält sie alle — unbegrenzt, dauerhaft, auch
--      ohne Abo. Begrenzt wird ausschliesslich das NEUANLEGEN, und auch das
--      nur für Konten ohne Bestandsschutz.
--
-- Punkt 3 ist der Grund für diese Migration. Er liesse sich nicht
-- nachträglich rekonstruieren: sobald jemand nach dem Stichtag eine Strecke
-- löscht, wäre aus der blossen Anzahl nicht mehr ablesbar, ob er zum
-- Stichtag darüber lag. Die Markierung wird deshalb einmal gesetzt und
-- danach nie wieder berechnet.
--
-- Bestehende private Strecken werden weder gelöscht noch veröffentlicht noch
-- angefasst. Das gilt auch beim späteren Ende eines Abos (AGB Ziff. 9.1).

-- Eigene Tabelle statt einer Spalte an profiles. Der Grund ist die
-- Zugriffsschranke: profiles ist über "Profile sind öffentlich lesbar" für
-- jeden lesbar, eine neue Spalte dort wäre also entweder für alle sichtbar
-- oder bräuchte eine SECURITY-DEFINER-Funktion, um sie wieder zu verbergen.
-- Eine eigene Tabelle mit einer Policy auf die eigene Zeile kommt ohne
-- beides aus — die Schranke bleibt RLS, ohne erhöhte Rechte irgendwo.
create table public.private_strecken_bestandsschutz (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  festgestellt_am timestamptz not null default now()
);

comment on table public.private_strecken_bestandsschutz is
  'Konten, die zum Stichtag von 0064 mehr private Strecken hatten als das Freikontingent erlaubt. Einmalig befüllt, nie neu berechnet: hebt die Mengenbegrenzung für diese Konten dauerhaft auf.';

alter table public.private_strecken_bestandsschutz enable row level security;

-- Nur lesen, nur die eigene Zeile. Geschrieben wird ausschliesslich hier in
-- der Migration und allenfalls über den Service-Role-Client — dürfte die
-- angemeldete Person sich selbst eintragen, wäre die Mengenbegrenzung ein
-- PostgREST-Aufruf weit.
create policy "Nutzer lesen den eigenen Bestandsschutz"
  on public.private_strecken_bestandsschutz for select
  to authenticated
  using (user_id = auth.uid());

grant select (user_id) on public.private_strecken_bestandsschutz to authenticated;
revoke all on public.private_strecken_bestandsschutz from anon;

-- Der Stichtag. Konten mit mehr als einer privaten Strecke bekommen die
-- Markierung. Genau eine private Strecke braucht sie nicht — dieses Konto
-- liegt im Freikontingent und darf ohnehin behalten, was es hat.
insert into public.private_strecken_bestandsschutz (user_id)
select r.erstellt_von
from public.routes r
where r.ist_privat and r.erstellt_von is not null
group by r.erstellt_von
having count(*) > 1
on conflict (user_id) do nothing;

-- Entscheidet in EINEM Aufruf, ob eine weitere private Strecke angelegt
-- werden darf. Bewusst in der Datenbank und nicht in der Anwendung: dort
-- wären Zählen und Anlegen zwei Schritte, und zwei gleichzeitige Anfragen
-- sähen beide dieselbe Zahl und kämen beide durch.
--
-- KEIN security definer, ausdrücklich. Die Funktion liest nur Daten des
-- Aufrufers und kommt unter RLS an alles heran, was sie braucht:
--   - profiles.ist_premium — Spalten-Grant besteht seit 0027,
--   - routes — die Lesepolicy enthält "OR erstellt_von = auth.uid()",
--     eigene private Strecken sind also sichtbar,
--   - private_strecken_bestandsschutz — die Policy oben.
-- Erhöhte Rechte wären hier weder nötig noch zu rechtfertigen.
create or replace function public.darf_private_strecke_anlegen()
returns table (erlaubt boolean, vorhanden integer, grenze integer, grund text)
language plpgsql
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_ist_premium boolean;
  v_bestandsschutz boolean;
  v_anzahl integer;
  -- Spiegelt MAX_PRIVATE_STRECKEN_GRATIS in lib/premium.ts. Wer den einen
  -- Wert ändert, ändert eine in den AGB (Ziff. 3.2) zugesagte Leistung und
  -- muss den anderen mitziehen.
  v_grenze constant integer := 1;
begin
  if v_user_id is null then
    return query select false, 0, v_grenze, 'kontingent_erschoepft'::text;
    return;
  end if;

  select p.ist_premium into v_ist_premium
  from public.profiles p
  where p.id = v_user_id;

  select exists (
    select 1 from public.private_strecken_bestandsschutz b
    where b.user_id = v_user_id
  ) into v_bestandsschutz;

  select count(*)::integer into v_anzahl
  from public.routes r
  where r.erstellt_von = v_user_id and r.ist_privat;

  if coalesce(v_ist_premium, false) then
    return query select true, v_anzahl, null::integer, 'premium'::text;
  elsif v_bestandsschutz then
    return query select true, v_anzahl, null::integer, 'bestandsschutz'::text;
  elsif v_anzahl < v_grenze then
    return query select true, v_anzahl, v_grenze, 'kontingent_frei'::text;
  else
    return query select false, v_anzahl, v_grenze, 'kontingent_erschoepft'::text;
  end if;
end;
$$;

-- Die angemeldete Person fragt ihr eigenes Kontingent ab — die Funktion
-- nimmt keine Parameter und liest nur auth.uid(), es gibt also nichts, was
-- sich auf ein fremdes Konto richten liesse. anon bekommt sie trotzdem
-- nicht: ohne Anmeldung liefert sie ohnehin nur die gesperrte Antwort, und
-- ein Endpunkt weniger ist ein Endpunkt weniger.
--
-- Bei Funktionen halten anon und authenticated das Ausführungsrecht als
-- DIREKTEN Grant aus Supabases Default-Privilegien, nicht über PUBLIC. Ein
-- `revoke ... from public` allein wäre wirkungslos — genau die Falle, in die
-- 0059 gelaufen ist (siehe supabase/migrations/README.md).
revoke execute on function public.darf_private_strecke_anlegen() from public, anon;
grant execute on function public.darf_private_strecke_anlegen() to authenticated;
