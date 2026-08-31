-- IMRECALL — 027: Promemoria appuntamenti
--
-- Gli appuntamenti hanno già una colonna reminder_minutes_before (int[],
-- default {1440, 60}) ma finora nessun cron la leggeva: non partiva alcuna
-- notifica. Serve una tabella di log per evitare invii doppi quando il cron
-- (che gira ogni minuto via pg_cron) ricontrolla lo stesso appuntamento più
-- volte prima che l'orario del promemoria sia passato — stesso pattern già
-- usato per medication_logs.

create table appointment_reminder_logs (
  id               uuid primary key default uuid_generate_v4(),
  appointment_id   uuid not null references appointments(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  offset_minutes   int not null,
  notified_at      timestamptz default now(),
  unique (appointment_id, offset_minutes)
);

create index idx_appointment_reminder_logs_appt on appointment_reminder_logs (appointment_id);

alter table appointment_reminder_logs enable row level security;

create policy "appointment_reminder_logs_own" on appointment_reminder_logs for select using (auth.uid() = user_id);
