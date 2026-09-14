-- =====================================================================
-- Herkunft eines Kontos: wer kam über welchen Creator-Link.
--
-- Phase 2 aus docs/creator-links-plan.md, ausgearbeitet in
-- docs/herkunft-tracking-plan.md. 0084 hat die Codes selbst angelegt;
-- diese Migration reicht sie bis zur Registrierung durch.
--
-- Die Kette: app/c/[code]/route.ts setzt ein Cookie (First Touch),
-- signUp() gibt dessen Wert über options.data an supabase.auth.signUp()
-- weiter, wo er in raw_user_meta_data landet, und handle_new_user unten
-- prüft ihn und schreibt die Herkunft. Der Umweg über die Metadaten ist
-- nötig, weil signUp() bei aktivierter E-Mail-Bestätigung keine Session
-- zurückgibt: das Profil entsteht erst durch diesen Trigger, es gibt in
-- dem Moment also keinen eingeloggten Nutzer, in dessen Namen sich eine
-- Zeile schreiben liesse.
--
-- Zwei Tabellen, nicht eine, und keine Spalte in profiles:
--
--   * profiles trägt seit 0001 die Policy "Profile sind öffentlich
--     lesbar" mit using (true). Jede neue Spalte dort wäre für anon über
--     PostgREST abrufbar — "wer hat wen geworben" wäre öffentlich.
--   * registrierung_herkunft beantwortet "wer kam über wen" und wird bei
--     der Kontolöschung entfernt (0090).
--   * creator_konversionen beantwortet "was ist daraus geworden" und
--     überlebt die Kontolöschung, weil dort nur der Personenbezug
--     genullt wird. Ohne diese Trennung verlöre ein Creator mit jedem
--     gelöschten Konto eine Zählung, die er verdient hat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- registrierung_herkunft — eine Zeile pro Konto, genau einmal geschrieben
-- ---------------------------------------------------------------------
create table public.registrierung_herkunft (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Fremdschlüssel auf creator_links: ein Code, der hier steht, muss
  -- vergeben worden sein. Das ist zugleich die Bremse gegen das Löschen
  -- eines Codes, an dem bereits Registrierungen hängen — siehe den
  -- Kommentar zur Löschaktion in lib/actions/creatorLinks.ts.
  code text not null references public.creator_links (code),
  erstellt_am timestamptz not null default now()
);

comment on table public.registrierung_herkunft is
  'Ueber welchen Creator-Link ein Konto entstanden ist. Geschrieben ausschliesslich von handle_new_user() nach Pruefung gegen creator_links; bei der Kontoloeschung entfernt (0090). Keine Policy und keine Grants: erreichbar nur ueber SECURITY DEFINER-Funktionen und den Service-Role-Client (0088).';

alter table public.registrierung_herkunft enable row level security;

-- Supabase gibt neuen Tabellen per Default-Privilegien Rechte an anon und
-- authenticated. Erst vollständig entziehen, dann gezielt geben — hier
-- wird nichts gegeben, dieselbe Linie wie bei subscriptions (0059) und
-- stripe_webhook_events (0026).
revoke all on public.registrierung_herkunft from anon, authenticated;

-- RLS ist damit zwar aktiv, aber nicht die Schranke, die trägt: ohne
-- Tabellenrechte kommt über PostgREST ohnehin niemand heran. Beides
-- zusammen, weil eine spätere, versehentlich vergebene Berechtigung sonst
-- unmittelbar Zugriff gäbe.

-- ---------------------------------------------------------------------
-- creator_konversionen — das Ereignisprotokoll
--
-- Warum nicht einfach ein JOIN auf subscriptions, wenn die Frage
-- lautet "welche Käufe gehen auf Max": weil subscriptions Zustand ist
-- und nicht Verlauf.
--
--   1. apply_subscription_state schreibt on conflict (user_id) do
--      update — eine Zeile pro Konto, immer wieder überschrieben. Der
--      Zeitpunkt des ERSTEN Kaufs steht nirgends; updated_at ist der
--      letzte Webhook. Nach Kündigung und späterem neuem Abo ist die
--      erste Zuordnung restlos weg.
--   2. anonymize_account() löscht die Zeile (0076) — muss sie auch,
--      sonst stellt premium_abgleich() nachts ist_premium wieder her.
--      Ein Konto, das ein Jahr zahlte und dann gelöscht wurde, fiele aus
--      jeder Auswertung heraus.
--   3. Die Zuordnungsregel ("zählt ein Kauf 90 Tage nach der
--      Registrierung noch?") ist eine Geschäftsentscheidung, die sich
--      ändern kann. Wer sie beim Erfassen anwendet, hat die Daten für
--      jede andere Regel weggeworfen.
--
-- Deshalb: erfasst wird das Ereignis, abgeleitet wird die Regel. Diese
-- Tabelle ist im Betrieb append-only — geschrieben wird nur per INSERT,
-- ein UPDATE trifft ausschliesslich user_id (Anonymisierung, 0090).
-- ---------------------------------------------------------------------
create table public.creator_konversionen (
  id bigint generated always as identity primary key,
  code text not null references public.creator_links (code),
  art text not null,
  -- Nullable und ausdrücklich NICHT on delete cascade: bei der
  -- Kontolöschung wird der Bezug genullt, die Zeile bleibt stehen.
  --
  -- Die Automatik von on delete greift hier ohnehin nie:
  -- deleteAccount() (lib/actions/auth.ts) löscht die Zeile in auth.users
  -- NICHT — es ruft anonymize_account() und entwertet anschliessend die
  -- Zugangsdaten über updateUserById. Wer sich auf on delete verlässt,
  -- baut eine Löschung, die nie stattfindet. Das Nullen steht deshalb
  -- ausgeschrieben in 0090.
  user_id uuid references auth.users (id) on delete set null,
  -- Nur bei art in ('abo_start', 'abo_ende'). Keine Personendaten, aber
  -- der Schlüssel, über den sich ein Ende dem Anfang zuordnen lässt.
  stripe_subscription_id text,
  -- Wann das Ereignis stattfand und wann wir es erfasst haben. Die
  -- beiden driften auseinander, wenn ein Webhook nachgeliefert wird.
  ereignis_am timestamptz not null default now(),
  erfasst_am timestamptz not null default now(),
  -- Der Registrierungszeitpunkt des Kontos, redundant mitgeführt: ein
  -- Attributionsfenster ("Kauf innerhalb von 90 Tagen") lässt sich damit
  -- auswerten, ohne auf ein womöglich anonymisiertes Konto zu joinen.
  registriert_am timestamptz not null,

  constraint creator_konversionen_art
    check (art in ('registrierung', 'abo_start', 'abo_ende')),
  -- Ein Abo-Ereignis ohne Abo-ID wäre nicht zuordenbar, eine
  -- Registrierung mit einer wäre ein Denkfehler.
  constraint creator_konversionen_abo_id
    check (
      (art = 'registrierung' and stripe_subscription_id is null)
      or (art in ('abo_start', 'abo_ende') and stripe_subscription_id is not null)
    )
);

comment on table public.creator_konversionen is
  'Append-only Ereignisprotokoll der Creator-Zuordnung: Registrierung, erster zahlender Zustand eines Abos, erstes Ende davon. Ueberlebt die Kontoloeschung (dort wird nur user_id genullt, 0090), damit die Zaehlung eines Creators bestehen bleibt. Kennt bewusst KEIN Attributionsfenster — das ist Sache der Auswertung (0088).';

comment on column public.creator_konversionen.art is
  'registrierung | abo_start | abo_ende. abo_ende ist das ERSTE Ende dieses Abos, nicht der aktuelle Stand — den haelt public.subscriptions.';

-- Exakt-einmal statt mindestens-einmal. Stripe liefert Webhooks
-- wiederholt aus (AGENTS.md, Kernregel 12), und apply_subscription_state
-- schreibt bei jedem davon dieselbe subscriptions-Zeile erneut. Ohne
-- diesen Index entstünde pro Zustellung eine Konversion.
create unique index creator_konversionen_abo_einmalig
  on public.creator_konversionen (art, stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Ein Konto registriert sich einmal. NULL-Werte gelten in einem
-- Unique-Index als verschieden — anonymisierte Zeilen (user_id null)
-- behindern sich hier also gegenseitig nicht.
create unique index creator_konversionen_registrierung_einmalig
  on public.creator_konversionen (user_id)
  where art = 'registrierung' and user_id is not null;

-- Die Auswertung gruppiert nach Code.
create index creator_konversionen_code_art on public.creator_konversionen (code, art);

alter table public.creator_konversionen enable row level security;

revoke all on public.creator_konversionen from anon, authenticated;

-- Die Identity-Spalte hängt an einer impliziten Sequenz, für die
-- Supabase ebenfalls Default-Privilegien vergibt. Ohne Tabellenrechte
-- nützt sie niemandem etwas — entzogen wird sie trotzdem, weil ein
-- späteres, versehentliches grant auf die Tabelle sonst eine halb offene
-- Tür vorfände.
revoke all on sequence public.creator_konversionen_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- handle_new_user() — dieselbe Funktion wie in 0001, um die Herkunft
-- erweitert.
--
-- 0001 wird dabei NICHT angefasst (Kernregel 9: Migrationen sind
-- append-only). Der Trigger on_auth_user_created zeigt auf den
-- Funktionsnamen und nimmt die neue Fassung ohne Änderung an.
--
-- security definer set search_path = public bleibt (siehe 0073).
-- Ausführungsrechte: create or replace setzt die ACL einer bestehenden
-- Funktion NICHT zurück, die Entzüge aus 0027 und 0047 gelten also
-- weiter. Unten stehen sie trotzdem noch einmal — als Zusicherung, nicht
-- als Reparatur; 0079 beschreibt, warum man das hier lieber zweimal
-- hinschreibt als einmal annimmt.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');

  v_code := new.raw_user_meta_data ->> 'herkunft_code';

  -- raw_user_meta_data ist client-setzbar: supabase.auth.signUp({ options:
  -- { data } }) geht auch aus dem Browser-Client, an jeder Prüfung in
  -- lib/actions/auth.ts vorbei. Der Wert ist damit ein Vorschlag, keine
  -- Tatsache. Ohne die Prüfung hier könnte jeder beliebige Codes erfinden
  -- und die Zahlen eines Creators fluten. Nur ein tatsächlich vergebener,
  -- aktiver Code zählt.
  if v_code is not null and exists (
    select 1 from public.creator_links where code = v_code and aktiv
  ) then
    insert into public.registrierung_herkunft (user_id, code)
    values (new.id, v_code)
    on conflict do nothing;

    insert into public.creator_konversionen
      (code, art, user_id, ereignis_am, registriert_am)
    values (v_code, 'registrierung', new.id, now(), now())
    on conflict do nothing;
  end if;

  -- Ein unbekannter, deaktivierter oder fehlender Code führt zu NICHTS —
  -- ausdrücklich nicht zu einem Fehler. Diese Funktion hängt am INSERT auf
  -- auth.users: was sie wirft, bricht die Registrierung ab. Eine
  -- Registrierung darf niemals an der Herkunftsmessung scheitern.
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Legt bei jeder Neuregistrierung das Profil an und haelt seit 0088 zusaetzlich die Creator-Herkunft fest, sofern raw_user_meta_data.herkunft_code einen aktiven Code aus creator_links nennt. Der Code wird hier geprueft, weil die Metadaten client-setzbar sind.';

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;
