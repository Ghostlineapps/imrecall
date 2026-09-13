-- IMRECALL — 036: promemoria push mattutino "hai catturato qualcosa oggi?"
--
-- Nato da un confronto su una notifica alle 9 di mattina tipo "pronto a
-- catturare i ricordi della giornata". Due decisioni prese insieme
-- all'utente prima di scriverla:
--
-- 1. Opt-in dedicato, non dentro il push generico già esistente
--    (farmaci/appuntamenti): chi attiva le notifiche solo per i farmaci
--    non deve ritrovarsi anche questa, altrimenti rischia di disattivare
--    tutto il push pur di non vederla — e perdere così anche i
--    promemoria che gli servono davvero. Stesso principio già seguito per
--    tracks_cycle/tracks_pregnancy: mai attivo di default, sempre scelto
--    esplicitamente dall'utente (qui in Impostazioni → Notifiche).
-- 2. Inviata solo a chi non ha ancora catturato nulla quella mattina (vedi
--    /api/cron/daily-capture-reminder), per non essere rumore a chi ha
--    già usato l'app — stesso criterio del dedup su notified_at nel cron
--    farmaci.
alter table profiles
  add column daily_capture_reminder_enabled boolean not null default false;

-- Una riga per utente+giorno in cui il promemoria è già stato inviato:
-- evita un secondo invio se pg_cron chiama la route più di una volta nello
-- stesso minuto (stesso motivo del controllo su notified_at in
-- medication_logs / del vincolo unique in appointment_reminder_logs).
create table daily_capture_reminder_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  reminder_date date not null,
  sent_at timestamptz not null default now(),
  unique(user_id, reminder_date)
);
