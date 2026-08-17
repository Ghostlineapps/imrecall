-- IMRECALL — 003: Resurfacing intelligente & Scadenze
-- Questo è il cuore della differenziazione del prodotto: il "ti ricordi quando...?"
-- basato su luogo, tempo e persone, oltre alle scadenze automatiche.

-- Luoghi menzionati nelle memorie, geocodificati per il matching di prossimità
create table places (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  name            text not null,             -- es. "Siviglia", "quel ristorante in Triana"
  normalized_name text not null,
  latitude        double precision,
  longitude       double precision,
  -- livello di granularità: city permette match anche senza indirizzo esatto
  granularity     text default 'city',        -- 'city' | 'address' | 'poi'
  geocoded_at     timestamptz,
  created_at      timestamptz default now(),
  unique(user_id, normalized_name)
);

create table memory_places (
  memory_id  uuid references memories(id) on delete cascade,
  place_id   uuid references places(id) on delete cascade,
  confidence float default 1.0,
  primary key (memory_id, place_id)
);

-- Check-in di posizione dell'utente (aggiornato all'apertura app, non background
-- tracking — vedi nota su limiti iOS PWA nel piano)
create table location_checkins (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  latitude   double precision not null,
  longitude  double precision not null,
  created_at timestamptz default now()
);

-- Scadenze: bollo, assicurazione, fiscale, abbonamenti ecc.
create table deadlines (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references profiles(id) on delete cascade,
  memory_id           uuid references memories(id) on delete set null,  -- collegata alla memoria/foto originale
  title               text not null,
  category            deadline_category default 'altro',
  due_date            date not null,
  recurrence          deadline_recurrence default 'none',
  reminder_days_before int[] default array[15, 3],
  amount              numeric,               -- importo, se rilevato/inserito
  notes               text,
  completed           boolean default false,  -- pagata/rinnovata
  completed_at        timestamptz,
  -- se ricorrente, punta alla prossima occorrenza generata automaticamente
  next_occurrence_id  uuid references deadlines(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Coda di resurfacing generata dal motore: candidati pronti per notifica,
-- con punteggio di priorità per rispettare il limite "max 1 notifica/giorno"
create table resurface_candidates (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references profiles(id) on delete cascade,
  type           resurface_type not null,
  memory_id      uuid references memories(id) on delete cascade,
  deadline_id    uuid references deadlines(id) on delete cascade,
  place_id       uuid references places(id) on delete cascade,
  priority_score float not null default 0,     -- calcolato: recency, rilevanza, urgenza
  title          text not null,                -- testo pronto per la notifica
  body           text not null,
  sent           boolean default false,
  sent_at        timestamptz,
  dismissed      boolean default false,
  created_at     timestamptz default now()
);

-- "Circle back" manuale: l'utente sceglie esplicitamente quando rivedere una memoria
create table manual_recalls (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  memory_id    uuid not null references memories(id) on delete cascade,
  recall_at    timestamptz not null,          -- quando ripresentarla
  recall_label text,                          -- "tra 1 mese" / "prossima volta qui" / data custom
  triggered    boolean default false,
  created_at   timestamptz default now()
);

-- Viaggi pianificati, per il pre-trip digest
create table trips (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  place_id     uuid references places(id) on delete cascade,
  destination  text not null,
  start_date   date not null,
  end_date     date,
  digest_sent  boolean default false,
  created_at   timestamptz default now()
);
