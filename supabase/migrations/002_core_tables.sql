-- IMRECALL — 002: Tabelle core

create table profiles (
  id                        uuid primary key references auth.users(id) on delete cascade,
  email                     text not null,
  full_name                 text,
  avatar_url                text,
  stripe_customer_id        text unique,
  stripe_subscription_id    text,
  subscription_tier         subscription_tier default 'free',
  subscription_status       text default 'inactive',
  subscription_ends_at      timestamptz,
  memory_count_total        int default 0,
  memory_count_this_month   int default 0,
  storage_bytes_used        bigint default 0,
  onboarding_completed      boolean default false,
  preferred_language        text default 'it',
  -- Preferenze per il motore di notifiche (evita di sommergere l'utente)
  max_notifications_per_day int default 1,
  notification_types_enabled resurface_type[] default array['on_this_day','proximity','pre_trip','people','deadline','manual_recall']::resurface_type[],
  -- Streak di cattura, motore di abitudine
  capture_streak_days       int default 0,
  last_capture_date         date,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

create table memories (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references profiles(id) on delete cascade,
  type                 memory_type not null,
  status               memory_status default 'processing',

  title                text,
  content              text,
  raw_content          text,
  ai_summary           text,
  ai_confidence        float,

  categories           text[],
  tags                 text[],

  embedding            vector(1536),

  media_path           text,
  media_url            text,
  media_size           bigint,
  media_duration       int,
  thumbnail_path       text,

  link_url             text,
  link_title           text,
  link_description     text,
  link_image_url       text,
  link_favicon_url     text,

  -- Intenzione aperta ("volevo andare a...") — nullable, popolato solo se l'AI
  -- classifica la memoria come intent
  is_intention         boolean default false,
  intention_status     intention_status,

  metadata             jsonb default '{}',

  memory_date          timestamptz default now(),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  deleted_at           timestamptz,

  error_message        text,
  processing_attempts  int default 0
);

create table entities (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  type            entity_type not null,
  name            text not null,
  normalized_name text not null,
  mention_count   int default 1,
  created_at      timestamptz default now(),
  unique(user_id, normalized_name, type)
);

create table memory_entities (
  memory_id   uuid references memories(id) on delete cascade,
  entity_id   uuid references entities(id) on delete cascade,
  confidence  float default 1.0,
  primary key (memory_id, entity_id)
);

create table chat_sessions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table chat_messages (
  id               uuid primary key default uuid_generate_v4(),
  session_id       uuid not null references chat_sessions(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  role             chat_role not null,
  content          text not null,
  cited_memory_ids uuid[],
  tokens_used      int,
  created_at       timestamptz default now()
);

create table insights (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references profiles(id) on delete cascade,
  insight_date   date not null,
  type           text not null,
  title          text not null,
  content        text not null,
  memory_ids     uuid[],
  dismissed      boolean default false,
  created_at     timestamptz default now(),
  unique(user_id, insight_date, type)
);

create table usage_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  operation       text not null,
  tokens_input    int default 0,
  tokens_output   int default 0,
  cost_usd        float default 0,
  created_at      timestamptz default now()
);
