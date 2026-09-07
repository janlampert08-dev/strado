-- =====================================================================
-- Moderatoren-Policy auf route_completions: WITH CHECK nachtragen.
--
-- Befund N7 aus docs/audit/2026-09-07-followup.md.
--
-- 0046 legte die Policy so an:
--
--   create policy "Moderatoren können Fahrten entöffentlichen"
--     on public.route_completions for update
--     using (exists (select 1 from public.profiles
--                    where id = (select auth.uid()) and is_moderator = true));
--
-- Ohne WITH CHECK verwendet Postgres die USING-Bedingung auch als
-- Check (CREATE POLICY, "if no WITH CHECK expression is defined, then
-- the USING expression will be used both to determine which rows are
-- visible and which new rows will be allowed to be added"). Dieses
-- Prädikat prüft ausschliesslich den Aufrufer und keine einzige Spalte
-- der Zeile — als Check ist es damit unbedingt wahr.
--
-- Zusammen mit dem Spalten-Grant aus 0046
--
--   grant update (ist_oeffentlich, notiz, track_oeffentlich)
--     on public.route_completions to authenticated;
--
-- darf ein Moderator dadurch die Fahrt eines Fremden von privat auf
-- ÖFFENTLICH stellen, deren private notiz überschreiben und
-- track_oeffentlich setzen. Für art = 'frei' greift auch der
-- Coverage-Trigger nicht ein (0052 kehrt dort früh zurück). Der
-- Kommentar der Policy behauptet das Gegenteil: "Bewusst nur das und
-- kein Löschen".
--
-- Der Unterschied zur routes-UPDATE-Policy (0001:112), die ebenfalls
-- kein WITH CHECK hat, ist genau dieser: dort ist das Prädikat
-- zeilenabhängig (erstellt_von = auth.uid() and status_ok = false) und
-- schützt als Check die beiden Spalten, die es nennt. Hier ist es
-- zeilenunabhängig — deshalb ist die Auslassung nur hier ein Defekt.
--
-- Risiko: niedrig. lib/actions/moderation.ts:157-160 schreibt genau
-- { ist_oeffentlich: false, track_oeffentlich: null } — der einzige
-- Aufrufer bleibt gültig. Die Besitzer-Policy (0001:183) ist permissiv
-- und wird per OR verknüpft, der Besitzer verliert also nichts.
--
-- DROP und CREATE stehen bewusst in derselben Migration und damit in
-- derselben Transaktion. Zwischenzustand wäre eine Tabelle ohne diese
-- Policy — bei aktivem RLS heisst das dicht, nicht offen.
-- =====================================================================

drop policy if exists "Moderatoren können Fahrten entöffentlichen"
  on public.route_completions;

create policy "Moderatoren können Fahrten entöffentlichen"
  on public.route_completions for update
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and is_moderator = true
    )
  )
  with check (
    -- Entöffentlichen ja, veröffentlichen nein. Der gekappte Track muss
    -- dabei mit verschwinden, sonst bliebe er über public_fahrt_tracks
    -- erreichbar, sobald die Fahrt je wieder öffentlich wird.
    ist_oeffentlich = false
    and track_oeffentlich is null
  );

comment on policy "Moderatoren können Fahrten entöffentlichen"
  on public.route_completions is
  'Moderation darf eine gemeldete Fahrt aus der Oeffentlichkeit nehmen — und nur das. Das WITH CHECK ist die eigentliche Schranke: ohne es verwendet Postgres die USING-Bedingung als Check, und die prueft nur den Aufrufer, nicht die Zeile, ist als Check also unbedingt wahr. Mit dem Spalten-Grant aus 0046 haette ein Moderator damit fremde Fahrten veroeffentlichen und deren private notiz ueberschreiben koennen (0071).';

-- =====================================================================
-- Nachtrag: notiz bleibt dem Besitzer.
--
-- Das WITH CHECK oben deckt ist_oeffentlich und track_oeffentlich ab —
-- mehr kann es nicht. Eine Policy sieht nur die NEUE Zeile; ob eine
-- Spalte gegenüber dem Vorzustand verändert wurde, lässt sich darin
-- nicht ausdrücken. Der Spalten-Grant aus 0046 umfasst aber auch notiz,
-- und die ist der private Text des Fahrers. Ein Moderator könnte ihn
-- also weiterhin überschreiben, solange er im selben UPDATE
-- ist_oeffentlich = false setzt.
--
-- Den Grant zu entziehen ist keine Option: er gilt für die Rolle
-- authenticated, und der Besitzer braucht ihn für die eigene Fahrt.
-- OLD/NEW gibt es nur im Trigger — deshalb hier einer.
--
-- auth.uid() is null wird bewusst durchgelassen: das ist der
-- Service-Role-Pfad (lib/supabase/admin.ts, Stripe-Webhook) und
-- SECURITY DEFINER-Funktionen wie anonymize_account. Ein anonymer
-- PostgREST-Zugriff hätte ebenfalls null, kommt aber gar nicht so weit —
-- für anon existiert auf dieser Tabelle keine UPDATE-Policy.
-- =====================================================================

create or replace function public.fahrt_notiz_nur_vom_besitzer()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.notiz is distinct from old.notiz
     and (select auth.uid()) is not null
     and (select auth.uid()) <> old.user_id then
    raise exception 'notiz darf nur vom Besitzer der Fahrt geaendert werden'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

comment on function public.fahrt_notiz_nur_vom_besitzer() is
  'Haelt die private notiz einer Fahrt beim Besitzer. Die Moderator-Policy aus 0046/0071 laesst Fremd-UPDATEs zu und der Spalten-Grant aus 0046 umfasst notiz; eine Policy kann OLD nicht sehen, ein Trigger schon (0071).';

drop trigger if exists fahrt_notiz_nur_vom_besitzer_trg on public.route_completions;

create trigger fahrt_notiz_nur_vom_besitzer_trg
  before update of notiz on public.route_completions
  for each row execute function public.fahrt_notiz_nur_vom_besitzer();

-- EXECUTE liegt bei einer neuen Funktion standardmässig bei PUBLIC. Für
-- eine Trigger-Funktion ist das folgenlos (sie ist ohne Trigger-Kontext
-- nicht aufrufbar), aber 0047/0048 haben genau diese Grants für alle
-- übrigen Funktionen entzogen — hier dieselbe Linie, damit die
-- Bestandsaufnahme in der Checkliste keine Ausnahme kennt.
revoke execute on function public.fahrt_notiz_nur_vom_besitzer() from public;
revoke execute on function public.fahrt_notiz_nur_vom_besitzer() from anon;
revoke execute on function public.fahrt_notiz_nur_vom_besitzer() from authenticated;
