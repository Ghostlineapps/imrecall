-- IMRECALL — 031: tracciamento ciclo mestruale
--
-- Richiesta dell'utente ("in salute aggiungere il ciclo... fatto
-- benissimo"), pensata per aumentare la frequenza d'uso quotidiana
-- dell'app — il ciclo è probabilmente il dato di salute con la cadenza di
-- interazione più regolare che esista (vedi il successo di Flo/Clue) — e
-- per differenziarsi da quelle app collegando sintomi/umore registrati ai
-- ricordi già salvati (vedi /api/cycle/insights): un tracciamento ciclo
-- isolato non potrebbe farlo, non ha la cronologia personale dell'utente.
--
-- Stesso schema architetturale di Gravidanza (028): un modulo a sé con le
-- proprie tabelle, non una categorizzazione parallela dei ricordi. Stessa
-- protezione dati (RLS per-utente) già usata per referti/gravidanza —
-- nessuna cifratura applicativa aggiuntiva in questa prima versione, per
-- restare sullo standard già collaudato nell'app invece di introdurre un
-- meccanismo nuovo e non testato proprio sul dato più sensibile che
-- trattiamo.

-- Impostazioni per utente: una sola riga, upsert su user_id.
-- average_cycle_length/average_period_length e cycles_tracked vengono
-- aggiornati dal server (vedi /api/cycle/logs) quando un nuovo ciclo viene
-- confermato, non ricalcolati ad ogni lettura — restano stabili e
-- guidano il livello di confidenza mostrato nelle previsioni (poche
-- osservazioni = range più ampio e onesto, non una data secca).
create table cycle_settings (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid not null unique references profiles(id) on delete cascade,
  tracking_mode          text not null default 'general_health', -- general_health | trying_to_conceive | avoiding_pregnancy
  average_cycle_length   integer not null default 28,
  average_period_length  integer not null default 5,
  cycles_tracked         integer not null default 0,
  notifications_enabled  boolean not null default true,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

alter table cycle_settings enable row level security;
create policy "cycle_settings_own" on cycle_settings for all using (auth.uid() = user_id);

-- Un log per giorno (upsert su user_id + log_date). flow null significa
-- "nessun sanguinamento quel giorno": si possono comunque registrare
-- sintomi/umore/note senza essere in mestruazione.
create table cycle_logs (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  log_date     date not null,
  flow         text,                      -- null | spotting | light | medium | heavy
  symptoms     text[] not null default '{}', -- es. crampi, mal_di_testa, gonfiore, acne, tensione_seno, nausea, stanchezza
  mood         text[] not null default '{}', -- es. felice, irritabile, triste, ansiosa, energica, stanca
  basal_temp   numeric(4,2),              -- °C, opzionale, per chi la misura
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (user_id, log_date)
);

create index idx_cycle_logs_user_date on cycle_logs (user_id, log_date desc);

alter table cycle_logs enable row level security;
create policy "cycle_logs_own" on cycle_logs for all using (auth.uid() = user_id);

-- Periodi derivati dai log (gruppi di giorni con flow non nullo),
-- mantenuti da /api/cycle/logs quando rileva l'inizio di un nuovo periodo
-- invece di essere ricalcolati ad ogni richiesta dall'intera cronologia:
-- rende immediato il calcolo della media mobile della lunghezza del ciclo.
create table cycle_periods (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references profiles(id) on delete cascade,
  start_date         date not null,
  end_date           date,               -- null finché il periodo è in corso
  cycle_length_days  integer,            -- giorni dall'inizio del periodo precedente; null per il primo registrato
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (user_id, start_date)
);

create index idx_cycle_periods_user_start on cycle_periods (user_id, start_date desc);

alter table cycle_periods enable row level security;
create policy "cycle_periods_own" on cycle_periods for all using (auth.uid() = user_id);
