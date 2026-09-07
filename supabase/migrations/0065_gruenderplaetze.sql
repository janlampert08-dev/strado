-- Gründerpreis: die ersten 100 Abos zu CHF 39.00 im Jahr statt CHF 49.00.
--
-- Die Zusage steht so in den veröffentlichten AGB (Ziff. 4.3) und ist damit
-- eine Vertragsleistung, keine Marketingfarbe: "für die ersten 100
-- abgeschlossenen Abos", preisgebunden, solange das Abo ununterbrochen
-- besteht.
--
-- Warum ein eigenes Verzeichnis und nicht einfach count(*) auf subscriptions:
-- dort steht eine Zeile pro Konto, und sie verschwindet, wenn das Konto
-- gelöscht wird. Eine Zählung darüber liefe mit jeder Abwanderung wieder
-- nach unten, und aus "die ersten 100" würden stillschweigend beliebig
-- viele. Dieses Verzeichnis wird nur ergänzt, nie aufgeräumt.
--
-- Ein vergebener Platz gilt dem Konto, nicht dem einzelnen Abo: wer kündigt
-- und später zurückkommt, behält seinen Platz und zahlt wieder den
-- Gründerpreis. Das ist grosszügiger als Ziff. 4.3 verlangt (dort erlischt
-- die Preisbindung mit der Kündigung) — aber die Zusage ist eine
-- Mindestzusage, und ein zurückkehrender früher Unterstützer ist genau die
-- Person, für die der Preis gedacht war.

create table public.gruender_plaetze (
  -- on delete cascade greift praktisch nie: die Kontolöschung anonymisiert
  -- die Profilzeile, sie entfernt sie nicht (0058). Steht trotzdem da, damit
  -- kein verwaister Verweis entstehen kann, falls sich das einmal ändert.
  user_id uuid primary key references public.profiles(id) on delete cascade,
  vergeben_am timestamptz not null default now()
);

comment on table public.gruender_plaetze is
  'Vergebene Gründerpreis-Plätze (AGB Ziff. 4.3). Wird nur ergänzt, nie aufgeräumt — eine schrumpfende Zählung würde die Zusage "die ersten 100" aushebeln.';

-- Kein Zugriff für angemeldete Nutzer, weder lesend noch schreibend. Die
-- Anzahl freier Plätze wird über die Funktion unten gemeldet; die Liste, WER
-- einen Platz hat, geht niemanden etwas an.
alter table public.gruender_plaetze enable row level security;
revoke all on public.gruender_plaetze from anon, authenticated;

-- Vergibt einen Platz, wenn noch einer frei ist. Gibt zurück, ob das Konto
-- (jetzt oder schon vorher) einen Platz hat.
--
-- Der Advisory Lock ist der Kern: ohne ihn sähen zwei gleichzeitige Aufrufe
-- beide dieselbe Zahl 99 und vergäben Platz 100 und 101. Dieselbe Technik
-- wie in apply_subscription_state (0059), dort pro Nutzer, hier für den
-- einen gemeinsamen Zähler.
--
-- KEIN security definer. Die Funktion wird ausschliesslich mit dem
-- Service-Role-Client aufgerufen (lib/actions/billing.ts), der ohnehin alle
-- Rechte hat — erhöhte Rechte an der Funktion wären reine Angriffsfläche.
-- p_user_id stammt dort aus der bereits über supabase.auth.getUser()
-- verifizierten Session, nie aus einer Formulareingabe.
create or replace function public.gruenderplatz_beanspruchen(p_user_id uuid, p_maximum integer default 100)
returns boolean
language plpgsql
as $$
declare
  v_hat_platz boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('gruender_plaetze', 0));

  select exists (select 1 from public.gruender_plaetze where user_id = p_user_id)
    into v_hat_platz;
  if v_hat_platz then
    return true;
  end if;

  if (select count(*) from public.gruender_plaetze) >= p_maximum then
    return false;
  end if;

  insert into public.gruender_plaetze (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  return true;
end;
$$;

-- Wie viele Plätze sind noch frei? Für die Anzeige auf der Kaufseite
-- ("noch N von 100"). Nennt nur die Zahl, nie die Konten.
create or replace function public.gruenderplaetze_frei(p_maximum integer default 100)
returns integer
language sql
stable
as $$
  select greatest(0, p_maximum - (select count(*)::integer from public.gruender_plaetze));
$$;

-- Beide Funktionen sind Server-Sache. Ein Client, der
-- gruenderplatz_beanspruchen() selbst aufrufen könnte, würde Plätze
-- verbrennen, ohne je zu bezahlen.
--
-- Bei Funktionen halten anon und authenticated das Ausführungsrecht als
-- DIREKTEN Grant aus Supabases Default-Privilegien, nicht über PUBLIC — ein
-- `revoke ... from public` allein wäre wirkungslos (siehe
-- supabase/migrations/README.md, die Falle aus 0059).
revoke execute on function public.gruenderplatz_beanspruchen(uuid, integer) from public, anon, authenticated;
revoke execute on function public.gruenderplaetze_frei(integer) from public, anon, authenticated;
grant execute on function public.gruenderplatz_beanspruchen(uuid, integer) to service_role;
grant execute on function public.gruenderplaetze_frei(integer) to service_role;
