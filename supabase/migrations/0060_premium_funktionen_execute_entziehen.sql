-- Sicherheitskorrektur zu 0059_premium_abo_zustand.sql.
--
-- 0059 wollte den drei neuen Funktionen das Ausführungsrecht entziehen und
-- tat das mit "revoke execute ... from public". Das war wirkungslos: anon und
-- authenticated halten das Recht nicht über PUBLIC, sondern als DIREKTEN
-- Grant aus Supabases Default-Privilegien. Ein revoke gegen einen Grantee,
-- der die Berechtigung nicht auf der widerrufenen Ebene hält, ist keine
-- Fehlermeldung, sondern eine stille No-Op — genau die Falle, an der schon
-- 0027 gescheitert ist und die 0047/0048 nachträglich räumen mussten (siehe
-- supabase/migrations/README.md).
--
-- Nach dem Einspielen von 0059 sah aclexplode(proacl) so aus:
--   apply_subscription_state -> anon, authenticated, postgres, service_role
-- Damit war apply_subscription_state mit dem öffentlichen anon-Key direkt
-- über PostgREST aufrufbar. Der erste Parameter ist eine frei wählbare
-- stripe_customer_id, und die Funktion setzt daraufhin ist_premium für das
-- Profil, das diese ID trägt. Ein Aufruf mit dem Status 'active' hätte also
-- beliebigen Konten Premium verschafft — dieselbe Klasse von Lücke wie bei
-- der entfernten set_premium_status-RPC (0022/0023), diesmal sogar ohne
-- Secret davor.
--
-- 0059 wird nicht angefasst: eine eingespielte Migration bleibt stehen, auch
-- wenn sie einen Fehler enthält (Kernregel 9). Diese hier korrigiert ihn.

revoke execute on function public.subscription_ist_premium(text, timestamptz) from anon, authenticated;
revoke execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) from anon, authenticated;
revoke execute on function public.premium_abgleich() from anon, authenticated;

-- Der Vollständigkeit halber auch PUBLIC, falls in einer anderen Umgebung
-- (frische Datenbank, abweichende Default-Privilegien) das Recht doch von
-- dort kommt. Diese Zeilen sind die aus 0059 — dort waren sie allein zu
-- wenig, hier sind sie die Ergänzung, nicht die Massnahme.
revoke execute on function public.subscription_ist_premium(text, timestamptz) from public;
revoke execute on function public.apply_subscription_state(text, text, text, text, timestamptz, boolean, timestamptz, text, text, integer) from public;
revoke execute on function public.premium_abgleich() from public;

-- service_role behält das Recht (in 0059 gesetzt) — der Webhook, der
-- Abgleich und confirmSubscription rufen ausschliesslich darüber auf.
