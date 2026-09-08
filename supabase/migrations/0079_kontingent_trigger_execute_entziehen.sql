-- ---------------------------------------------------------------------------
-- private_strecke_kontingent_pruefen(): Ausführungsrecht entziehen
--
-- 0067 hat die Kontingentgrenze für private Strecken an den Schreibrand
-- gelegt — ein BEFORE-Trigger auf routes, SECURITY DEFINER, weil er alle
-- privaten Strecken des Kontos zählen muss und als Aufrufer von RLS
-- gefiltert würde. Die Begründung steht dort und gilt unverändert.
--
-- Was 0067 vergessen hat, ist der Entzug des EXECUTE-Rechts. Postgres
-- vergibt es beim CREATE an PUBLIC, und Supabases Default-Privilegien geben
-- es anon und authenticated zusätzlich direkt — genau die Falle, die
-- supabase/migrations/README.md unter "Was aus einer Migration heraus nicht
-- geht" beschreibt und die 0059_premium_abo_zustand schon einmal getroffen
-- hat. Der Supabase-Advisor meldet die Funktion deshalb unter
-- anon_security_definer_function_executable: sie ist über
-- /rest/v1/rpc/private_strecke_kontingent_pruefen abgesetzt aufrufbar.
--
-- Gemessener Ist-Zustand vor dieser Migration (aclexplode über pg_proc):
--
--   private_strecke_kontingent_pruefen  ->  PUBLIC, anon, authenticated,
--                                           postgres, service_role
--
-- Jede andere Trigger-Funktion im Schema steht bereits nur postgres und
-- service_role offen (enforce_completion_cooldown,
-- enforce_completion_photo_limit, enforce_rating_cooldown,
-- enforce_route_proposal_cooldown, handle_new_user). Diese eine ist die
-- Ausnahme, und sie ist keine gewollte.
--
-- Wie gross ist der Schaden heute? Klein, aber nicht null: die Funktion
-- liest `new`, das ausserhalb eines Triggers nicht zugewiesen ist, ein
-- direkter RPC-Aufruf endet also in einem Fehler statt in einer
-- Zustandsänderung. Der Entzug schliesst trotzdem: (a) den Aufruf als
-- Rauschquelle im RPC-Log, (b) die Verwechslungsgefahr mit der bewusst für
-- authenticated freigegebenen darf_private_strecke_anlegen(), und (c) die
-- Annahme, dieser Fehlerpfad bleibe bei jeder künftigen Änderung des
-- Funktionsrumpfs harmlos. Ein Recht, das niemand braucht, gehört entzogen,
-- bevor es jemand braucht.
--
-- Auf das Feuern des Triggers hat der Entzug keinen Einfluss: eine
-- Trigger-Funktion wird vom Server aufgerufen, nicht vom Client, und prüft
-- dabei kein EXECUTE-Recht (siehe 0047, Abschnitt A, dieselbe Feststellung
-- für die Cooldown-Trigger).
--
-- Beide Richtungen entziehen, weil das eine das andere nicht erledigt:
-- ein revoke von PUBLIC entfernt keinen direkten Grant an anon oder
-- authenticated (0047/0048), und umgekehrt.
-- ---------------------------------------------------------------------------

revoke execute on function public.private_strecke_kontingent_pruefen() from public;
revoke execute on function public.private_strecke_kontingent_pruefen() from anon, authenticated;

comment on function public.private_strecke_kontingent_pruefen() is
  'Trigger-Funktion aus 0067: begrenzt private Strecken auf das Freikontingent bzw. den Bestandsschutz. SECURITY DEFINER, weil sie alle privaten Strecken des Kontos zaehlen muss. Seit 0079 ohne EXECUTE fuer PUBLIC/anon/authenticated — als Trigger wird sie vom Server aufgerufen und braucht das Recht nicht.';

-- Gegenprobe nach dem Einspielen (Soll: nur postgres und service_role):
--
--   select coalesce(a.grantee::regrole::text, 'PUBLIC') as grantee
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(p.proacl) a
--   where n.nspname = 'public'
--     and p.proname = 'private_strecke_kontingent_pruefen'
--     and a.privilege_type = 'EXECUTE';
