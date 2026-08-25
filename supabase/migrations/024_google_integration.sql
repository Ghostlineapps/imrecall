-- IMRECALL — 024: Integrazione Google (Gmail → Appuntamenti + Google Calendar)
--
-- Richiesta utente: quando arriva un'email che propone una riunione, una
-- videocall o una prenotazione, ImRecall deve rilevarla da sola e creare
-- l'appuntamento — stessa logica APPOINTMENT_DETECTED già in uso per gli
-- screenshot di chat (source 'photo') e le riunioni registrate (source
-- 'meeting'), applicata qui al testo delle email (source 'email'), più la
-- sincronizzazione dell'evento sul Google Calendar dell'utente.

-- Un solo collegamento Google per utente: Gmail (lettura) e Calendar
-- (scrittura eventi) condividono lo stesso consenso OAuth, richiesto in
-- un'unica schermata di autorizzazione.
create table google_integrations (
  user_id                  uuid primary key references profiles(id) on delete cascade,
  refresh_token            text not null,  -- cifrato applicativamente, vedi src/lib/google/tokenCrypto.ts — mai in chiaro
  access_token             text,           -- cache di breve durata, rigenerato dal refresh token quando serve
  access_token_expires_at  timestamptz,
  google_email             text,           -- indirizzo Gmail collegato, mostrato in Impostazioni
  scope                    text not null,
  last_synced_at           timestamptz,    -- watermark: il cron processa solo le email arrivate dopo questo istante
  connected_at             timestamptz default now(),
  updated_at               timestamptz default now()
);

alter table google_integrations enable row level security;
create policy "google_integrations_own" on google_integrations for all using (auth.uid() = user_id);

-- Evita di processare due volte la stessa email: il polling periodico
-- rilegge una finestra che si sovrappone leggermente a quella precedente
-- (per non perdere email arrivate proprio a cavallo tra due sync), quindi
-- serve un registro esplicito di cosa è già stato controllato.
create table processed_gmail_messages (
  user_id           uuid not null references profiles(id) on delete cascade,
  gmail_message_id  text not null,
  processed_at      timestamptz default now(),
  primary key (user_id, gmail_message_id)
);

alter table processed_gmail_messages enable row level security;
create policy "processed_gmail_messages_own" on processed_gmail_messages for all using (auth.uid() = user_id);

-- Collega l'appuntamento all'evento gemello creato su Google Calendar, per
-- poterlo aggiornare/cancellare in futuro invece di duplicarlo ad ogni sync.
alter table appointments add column if not exists google_event_id text;
