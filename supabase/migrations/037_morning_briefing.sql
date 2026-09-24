-- IMRECALL — 037: Briefing mattutino
-- Prima notifica "composta" dell'app: invece di un singolo resurface
-- candidate, un unico messaggio che riassume la giornata (appuntamenti di
-- oggi + scadenze vicine + il miglior ricordo da resurfacing), inviato una
-- volta al giorno a un orario fisso — stesso principio di opt-in esplicito
-- di daily_capture_reminder_enabled (migration 036), stesso motivo nel
-- commento lì: mai attivo di default, va acceso da Impostazioni →
-- Notifiche, e non deve sovrapporsi al promemoria "cattura qualcosa oggi"
-- già esistente (i due sono toggle indipendenti, l'utente può avere
-- entrambi, uno solo, o nessuno).
alter table profiles
  add column morning_briefing_enabled boolean not null default false;

-- Stesso pattern di dedup di daily_capture_reminder_logs e
-- appointment_reminder_logs: un vincolo unique su (user_id, data) invece di
-- un flag "già inviato oggi" da azzerare a mezzanotte, così il cron
-- pg_cron-al-minuto (vedi /api/cron/morning-briefing) può girare più volte
-- nello stesso minuto senza inviare due volte lo stesso briefing.
create table morning_briefing_logs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  briefing_date date not null,
  sent_at       timestamptz default now(),
  unique(user_id, briefing_date)
);

alter table morning_briefing_logs enable row level security;

-- Stessa policy di sola lettura del proprio storico già usata per
-- appointment_reminder_logs (migration 027) — le scritture avvengono solo
-- lato server con la service key, che bypassa RLS.
create policy "morning_briefing_logs_own" on morning_briefing_logs for select using (auth.uid() = user_id);
