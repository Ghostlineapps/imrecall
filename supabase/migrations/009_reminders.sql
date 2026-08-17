-- IMRECALL — 009: Notifiche push per i promemoria di scadenza
--
-- Il cron giornaliero (/api/cron/insights) già genera i candidati di
-- resurfacing per le scadenze in avvicinamento; qui aggiungiamo la tabella
-- per salvare le sottoscrizioni push del browser, così il cron può anche
-- inviare una notifica attiva (oltre alla card mostrata in-app) invece di
-- aspettare che l'utente apra l'app.

create table if not exists push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz default now()
);

create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions_own" on push_subscriptions for all using (auth.uid() = user_id);
