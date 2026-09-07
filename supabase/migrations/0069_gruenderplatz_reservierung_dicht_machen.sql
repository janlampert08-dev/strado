-- Zwei Lücken in der Gründerplatz-Reservierung aus 0066 schliessen.
--
-- 0066 hat den Platz vom sofortigen Verbrauch auf eine ablaufende
-- Reservierung umgestellt. Richtig, aber an zwei Stellen zu unbedacht.
--
-- LÜCKE 1 — die abgelaufene eigene Zeile umgeht die Kontingentprüfung.
--
-- gruenderplatz_beanspruchen hat mit `if found then` nur geprüft, OB eine
-- Zeile für dieses Konto existiert, nicht ob deren Reservierung noch läuft.
-- Eine abgelaufene Zeile bekam damit eine frische Frist, ohne dass irgendwer
-- nachgezählt hätte. Mit p_maximum = 1:
--
--   A reserviert            → belegt = 1
--   A's Frist läuft ab      → belegt = 0
--   B reserviert            → belegt = 1   (der letzte Platz)
--   A kommt zurück          → Zeile gefunden, Frist erneuert, belegt = 2
--
-- Die Begründung in 0066 ("für dieses Konto ist der Platz schon gezählt")
-- stimmt nur, solange die Reservierung LÄUFT. Genau diese Bedingung fehlte.
--
-- LÜCKE 2 — Bestätigen und Reservieren liefen ohne gemeinsame Serialisierung.
--
-- gruenderplatz_beanspruchen nimmt den Advisory Lock, gruenderplatz_bestaetigen
-- nahm ihn nicht. Eine Bestätigung konnte deshalb mitten in einer laufenden
-- Reservierung greifen, und gruenderplaetze_belegt() zählte je nach Zeitpunkt
-- unterschiedlich. Beide Funktionen nehmen jetzt denselben Lock.
--
-- Was hier BEWUSST NICHT passiert: die Bestätigung wird nicht abgelehnt, wenn
-- die Reservierung inzwischen abgelaufen oder das Kontingent voll ist.
-- gruenderplatz_bestaetigen läuft erst, nachdem Stripe die Zahlung bestätigt
-- hat — der Gründerpreis IST dann bereits abgebucht. Die Bestätigung zu
-- verweigern macht die Abbuchung nicht rückgängig, sie versteckt sie nur:
-- das Verzeichnis zählte 100, während 101 Leute den Gründerpreis zahlen, und
-- der nächste bekäme ihn ebenfalls. Eine Zeile, die eine tatsächlich erfolgte
-- Zahlung festhält, ist auch dann richtig, wenn sie das Kontingent
-- überschreitet. Die Schranke gehört an den Anfang des Kaufs, nicht ans Ende.
--
-- Deshalb ist die Reservierungsdauer der eigentliche Hebel — siehe unten.

-- Die Frist gilt jetzt 24 Stunden statt einer.
--
-- Der Gründerpreis wird festgelegt, wenn das Stripe-Abo entsteht, nicht wenn
-- bezahlt wird. Zwischen beidem liegt Stripes eigenes Zeitfenster: ein Abo im
-- Status `incomplete` bleibt rund 23 Stunden bezahlbar. Lief unsere
-- Reservierung nach einer Stunde ab, konnte jemand anders den Platz nehmen —
-- und die erste Zahlung danach trotzdem noch zum Gründerpreis durchgehen.
--
-- Mit 24 Stunden verfällt die Reservierung erst, wenn Stripe das Abo selbst
-- aufgegeben hat (`incomplete_expired`) und keine Abbuchung mehr kommen kann.
-- Der Preis dafür ist, dass ein abgebrochener Checkout den Platz einen Tag
-- statt eine Stunde blockiert. Bei 100 Plätzen ist das tragbar und immer noch
-- weit besser als 0065, wo er für immer weg war.
--
-- Der Kommentar in 0068 spricht noch von "nach einer Stunde" — angewandte
-- Migrationen werden nicht nachbearbeitet (Kernregel 9), die Zahl steht ab
-- hier hier.

create or replace function public.gruenderplatz_beanspruchen(
  p_user_id uuid,
  p_maximum integer default 100,
  p_reservierung_minuten integer default 1440
)
returns boolean
language plpgsql
as $$
declare
  v_bestaetigt boolean;
  v_laeuft_noch boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('gruender_plaetze', 0));

  -- Ohne Zeile bleiben beide Variablen NULL, und NULL ist in `if` nicht
  -- wahr — beide Zweige unten fallen dann korrekt durch zur Prüfung.
  select bestaetigt_am is not null,
         reserviert_bis is not null and reserviert_bis > now()
    into v_bestaetigt, v_laeuft_noch
  from public.gruender_plaetze
  where user_id = p_user_id;

  -- Schon bestätigt: der Platz gehört diesem Konto dauerhaft. Auch bei einem
  -- späteren Neuabschluss — grosszügiger als AGB Ziff. 4.3 verlangt, aber ein
  -- zurückkehrender früher Unterstützer ist genau die Person, für die der
  -- Preis gedacht war.
  if v_bestaetigt then
    return true;
  end if;

  -- Laufende Reservierung: diese Zeile zählt bereits gegen das Kontingent,
  -- eine Verlängerung ändert daran nichts. Nur hier darf die Prüfung
  -- entfallen.
  if v_laeuft_noch then
    update public.gruender_plaetze
    set reserviert_bis = now() + make_interval(mins => p_reservierung_minuten)
    where user_id = p_user_id;
    return true;
  end if;

  -- Ab hier zählt die eigene Zeile nicht mehr mit: abgelaufen oder gar nicht
  -- vorhanden. Also erst nachzählen — das ist der Fall, den 0066 übersprungen
  -- hat.
  if public.gruenderplaetze_belegt() >= p_maximum then
    return false;
  end if;

  insert into public.gruender_plaetze (user_id, reserviert_bis)
  values (p_user_id, now() + make_interval(mins => p_reservierung_minuten))
  on conflict (user_id) do update
    set reserviert_bis = excluded.reserviert_bis;

  return true;
end;
$$;

-- Bestätigen nimmt denselben Lock wie Reservieren, damit die beiden sich
-- nicht überschneiden können. Sonst unverändert und weiterhin idempotent:
-- ein zweiter Aufruf ändert nichts, und es wird nur bestätigt, was vorher
-- reserviert war (kein insert).
create or replace function public.gruenderplatz_bestaetigen(p_user_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_getroffen integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('gruender_plaetze', 0));

  update public.gruender_plaetze
  set bestaetigt_am = coalesce(bestaetigt_am, now()),
      reserviert_bis = null
  where user_id = p_user_id;

  get diagnostics v_getroffen = row_count;
  return v_getroffen > 0;
end;
$$;

comment on column public.gruender_plaetze.reserviert_bis is
  'Nur bei noch unbezahlten Versuchen gesetzt. Nach Ablauf zaehlt die Zeile nicht mehr gegen das Kontingent und beansprucht auch keinen Platz mehr, ohne erneut zu pruefen.';

-- create or replace erhaelt die Rechte aus 0066 (service_role only); die
-- Grants werden hier bewusst nicht wiederholt.
