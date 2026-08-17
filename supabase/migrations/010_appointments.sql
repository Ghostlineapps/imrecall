-- IMRECALL — 010: Appuntamenti
--
-- Le "Scadenze" (deadlines) coprono documenti con data di rinnovo (bollo,
-- assicurazione...). Gli "Appuntamenti" sono un concetto diverso: impegni con
-- data E ORA precisa, spesso rilevati da screenshot di chat (WhatsApp, email)
-- dove qualcuno propone un incontro. Prima non c'era nulla che li catturasse:
-- la foto finiva solo nella (ex-)Timeline, senza creare un promemoria utile.

create table appointments (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references profiles(id) on delete cascade,
  memory_id                uuid references memories(id) on delete set null,  -- collegato allo screenshot originale, se rilevato da foto
  title                    text not null,
  appointment_at           timestamptz not null,
  location                 text,
  notes                    text,
  source                   text default 'manual',  -- 'manual' | 'photo'
  reminder_minutes_before  int[] default array[1440, 60],  -- 1 giorno prima, 1 ora prima
  completed                boolean default false,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

create index idx_appointments_user_at on appointments (user_id, appointment_at);

alter table appointments enable row level security;

create policy "appointments_own" on appointments for all using (auth.uid() = user_id);
