-- Gründerplätze reservieren statt sofort verbrauchen.
--
-- 0065 hat den Platz vergeben, sobald jemand auf "Weiter zur Zahlung"
-- klickt — und das Verzeichnis wächst nur. Wer den Checkout abbricht, behält
-- den Platz trotzdem. Hundert abgebrochene Versuche hätten die Zusage aus
-- AGB Ziff. 4.3 aufgebraucht, ohne dass ein einziges Abo zustande kam.
--
-- Das war schon beim Schreiben von 0065 als Preis der Genauigkeit vermerkt.
-- Der Preis ist zu hoch: die Zusage lautet "die ersten 100 abgeschlossenen
-- Abos", und ein abgebrochener Checkout ist kein abgeschlossenes Abo.
--
-- Neu also zwei Zustände statt einem:
--
--   RESERVIERT  — beim Anlegen des Abos vergeben, läuft nach
--                 p_reservierung_minuten von selbst ab. Zählt bis dahin
--                 gegen das Kontingent, damit zwei gleichzeitige Käufe
--                 nicht denselben letzten Platz bekommen.
--   BESTÄTIGT   — die Zahlung ist bei Stripe verifiziert. Gilt dauerhaft
--                 und läuft nie ab.
--
-- Ein abgebrochener Checkout verfällt damit von selbst. Kein Aufräumjob
-- nötig: die Zählung ignoriert abgelaufene Reservierungen, die Zeile bleibt
-- als Spur liegen und wird beim nächsten Versuch derselben Person
-- wiederverwendet.

alter table public.gruender_plaetze
  add column if not exists bestaetigt_am timestamptz,
  add column if not exists reserviert_bis timestamptz;

-- Bestandszeilen aus 0065 gelten als bestätigt. In der Produktionsdatenbank
-- ist die Tabelle leer (0 Abos zum Zeitpunkt dieser Migration), die Zeile
-- ist also reine Vorsorge für den Fall, dass zwischen 0065 und hier doch
-- jemand gekauft hat — ihm nachträglich den Platz zu entziehen wäre der
-- schlechtere Fehler.
update public.gruender_plaetze
set bestaetigt_am = coalesce(bestaetigt_am, vergeben_am)
where bestaetigt_am is null and reserviert_bis is null;

comment on column public.gruender_plaetze.bestaetigt_am is
  'Gesetzt, sobald die Zahlung bei Stripe verifiziert ist. Ein bestätigter Platz läuft nie ab.';
comment on column public.gruender_plaetze.reserviert_bis is
  'Nur bei noch unbezahlten Versuchen gesetzt. Nach Ablauf zählt die Zeile nicht mehr gegen das Kontingent.';

-- Zählt, was das Kontingent tatsächlich belegt: bestätigte Plätze plus noch
-- laufende Reservierungen.
create or replace function public.gruenderplaetze_belegt()
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.gruender_plaetze
  where bestaetigt_am is not null
     or (reserviert_bis is not null and reserviert_bis > now());
$$;

create or replace function public.gruenderplaetze_frei(p_maximum integer default 100)
returns integer
language sql
stable
as $$
  select greatest(0, p_maximum - public.gruenderplaetze_belegt());
$$;

-- Reserviert einen Platz. Gibt zurück, ob das Konto einen hat — reserviert
-- oder bestätigt.
--
-- Der Advisory Lock bleibt: ohne ihn sähen zwei gleichzeitige Aufrufe beide
-- dieselbe Zahl und reservierten Platz 100 und 101.
create or replace function public.gruenderplatz_beanspruchen(
  p_user_id uuid,
  p_maximum integer default 100,
  p_reservierung_minuten integer default 60
)
returns boolean
language plpgsql
as $$
declare
  v_bestaetigt boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('gruender_plaetze', 0));

  select bestaetigt_am is not null into v_bestaetigt
  from public.gruender_plaetze
  where user_id = p_user_id;

  -- Schon bestätigt: der Platz gehört diesem Konto dauerhaft. Auch bei einem
  -- späteren Neuabschluss — grosszügiger als Ziff. 4.3 verlangt, aber ein
  -- zurückkehrender früher Unterstützer ist genau die Person, für die der
  -- Preis gedacht war.
  if v_bestaetigt then
    return true;
  end if;

  -- Eine bestehende, noch unbestätigte Zeile bekommt eine frische Frist,
  -- statt einen zweiten Platz zu verbrauchen. Deshalb steht die
  -- Kontingentprüfung erst danach: für dieses Konto ist der Platz schon
  -- gezählt.
  if found then
    update public.gruender_plaetze
    set reserviert_bis = now() + make_interval(mins => p_reservierung_minuten)
    where user_id = p_user_id;
    return true;
  end if;

  if public.gruenderplaetze_belegt() >= p_maximum then
    return false;
  end if;

  insert into public.gruender_plaetze (user_id, reserviert_bis)
  values (p_user_id, now() + make_interval(mins => p_reservierung_minuten))
  on conflict (user_id) do update
    set reserviert_bis = now() + make_interval(mins => p_reservierung_minuten);

  return true;
end;
$$;

-- Macht aus einer Reservierung einen dauerhaften Platz. Aufgerufen, sobald
-- die Zahlung bei Stripe verifiziert ist (confirmSubscription und der
-- Webhook — beide Wege, weil nicht garantiert ist, welcher zuerst ankommt
-- oder ob der Nutzer nach der Weiterleitung überhaupt zurückkehrt).
--
-- Idempotent: ein zweiter Aufruf ändert nichts. Legt bewusst KEINE Zeile an,
-- wenn keine existiert — bestätigt wird nur, was vorher reserviert war.
create or replace function public.gruenderplatz_bestaetigen(p_user_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_getroffen integer;
begin
  update public.gruender_plaetze
  set bestaetigt_am = coalesce(bestaetigt_am, now()),
      reserviert_bis = null
  where user_id = p_user_id;

  get diagnostics v_getroffen = row_count;
  return v_getroffen > 0;
end;
$$;

-- Server-Sache, wie in 0065. Ein Client, der reservieren könnte, würde
-- Plätze verbrennen, ohne je zu bezahlen; einer, der bestätigen könnte,
-- bekäme den Gründerpreis geschenkt.
--
-- Bei Funktionen halten anon und authenticated das Ausführungsrecht als
-- DIREKTEN Grant aus Supabases Default-Privilegien — ein `revoke ... from
-- public` allein wäre wirkungslos (siehe supabase/migrations/README.md).
revoke execute on function public.gruenderplatz_beanspruchen(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.gruenderplatz_bestaetigen(uuid) from public, anon, authenticated;
revoke execute on function public.gruenderplaetze_belegt() from public, anon, authenticated;
revoke execute on function public.gruenderplaetze_frei(integer) from public, anon, authenticated;
grant execute on function public.gruenderplatz_beanspruchen(uuid, integer, integer) to service_role;
grant execute on function public.gruenderplatz_bestaetigen(uuid) to service_role;
grant execute on function public.gruenderplaetze_belegt() to service_role;
grant execute on function public.gruenderplaetze_frei(integer) to service_role;

-- Die alte Zwei-Parameter-Fassung aus 0065 entfernen: sie hat noch sofort
-- verbraucht statt reserviert, und ein liegengebliebener Aufruf würde
-- unbemerkt die alte Semantik treffen.
drop function if exists public.gruenderplatz_beanspruchen(uuid, integer);
