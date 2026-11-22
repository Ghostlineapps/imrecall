-- IMRECALL — 040: rate limiting sulle route che chiamano OpenAI e Stripe
--
-- Richiesta utente (2026-11-22): nessuna delle route che chiamano OpenAI
-- (chat, ricerca, creazione/rielaborazione memorie — testo, foto, audio,
-- documenti, riunioni, farmaci, Telegram) o Stripe (/api/checkout) aveva un
-- freno sulla FREQUENZA delle richieste — solo tetti mensili per piano (vedi
-- src/lib/subscription/limits.ts), per giunta disattivati durante questa
-- fase di test (SUBSCRIPTION_LIMITS_ENABLED non impostato). Un client con un
-- bug (richieste in loop), uno script, o un uso deliberatamente abusivo
-- potevano quindi generare un numero arbitrario di chiamate a pagamento in
-- pochi secondi, senza alcun limite.
--
-- Implementato come contatore a finestra fissa in Postgres invece che in
-- memoria del processo Node: su Vercel ogni invocazione serverless è a sé
-- (spesso più d'una in parallelo per lo stesso utente), quindi un contatore
-- in-process non vedrebbe le richieste gestite da un'altra istanza e il
-- limite non scatterebbe mai davvero. Niente Upstash/Redis nel progetto —
-- Supabase, già usato ovunque, basta per questi volumi (poche richieste al
-- minuto per utente).
--
-- check_rate_limit() fa tutto in una singola istruzione INSERT ... ON
-- CONFLICT ... RETURNING: è il modo per renderla atomica sotto concorrenza
-- (due richieste parallele per la stessa chiave si serializzano sul lock di
-- riga di Postgres, invece di leggere-poi-scrivere con una finestra di corsa
-- in mezzo). Finestra fissa (non "sliding window"): più semplice, e
-- sufficiente per uno scopo di protezione da abusi/bug, non per una garanzia
-- di fatturazione precisa al secondo.
create table if not exists rate_limit_counters (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

comment on table rate_limit_counters is
  'Contatori a finestra fissa per il rate limiting applicativo (vedi check_rate_limit sotto). Chiave libera, tipicamente "<scope>:<user_id>" — niente FK verso altre tabelle: le chiavi sopravvivono anche a utenti Telegram non ancora collegati a un account.';

-- Nessuna policy: la tabella non va mai letta/scritta direttamente dal
-- client, solo tramite check_rate_limit() (security definer sotto). RLS
-- abilitata senza policy blocca comunque ogni accesso diretto via
-- PostgREST/anon-key, per coerenza con le altre tabelle del progetto.
alter table rate_limit_counters enable row level security;

create or replace function check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_count integer;
  v_window_start timestamptz;
  v_expired boolean;
begin
  insert into rate_limit_counters (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set
      -- Se la finestra precedente è scaduta, questa richiesta ne apre una
      -- nuova (count riparte da 1); altrimenti incrementa quella in corso.
      count = case
        when rate_limit_counters.window_start <= now() - (p_window_seconds || ' seconds')::interval
          then 1
        else rate_limit_counters.count + 1
      end,
      window_start = case
        when rate_limit_counters.window_start <= now() - (p_window_seconds || ' seconds')::interval
          then now()
        else rate_limit_counters.window_start
      end
  returning count, window_start into v_count, v_window_start;

  return v_count <= p_limit;
end;
$body$;

comment on function check_rate_limit(text, int, int) is
  'Incrementa atomicamente il contatore per p_key e ritorna true se è ancora entro p_limit richieste nella finestra di p_window_seconds secondi (finestra fissa, si resetta da sola alla prima richiesta successiva alla scadenza). Vedi src/lib/security/rateLimit.ts per l''uso lato applicazione.';

grant execute on function check_rate_limit(text, int, int) to authenticated, service_role;
