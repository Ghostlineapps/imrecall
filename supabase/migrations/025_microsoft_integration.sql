-- IMRECALL — 025: Integrazione Microsoft (Outlook → Appuntamenti + Outlook Calendar)
--
-- Stessa richiesta utente della migrazione 024 (Gmail), estesa a chi usa
-- Outlook/Hotmail invece di Gmail: stessa logica APPOINTMENT_DETECTED,
-- stesso rilevamento GPT-4o-mini condiviso (src/lib/openai/emailAppointment.ts),
-- via Microsoft Graph invece delle API Google.

-- Un solo collegamento Microsoft per utente, come per Google.
create table microsoft_integrations (
  user_id                  uuid primary key references profiles(id) on delete cascade,
  refresh_token            text not null,  -- cifrato con la stessa chiave usata per Google, vedi src/lib/google/tokenCrypto.ts — mai in chiaro
  access_token             text,
  access_token_expires_at  timestamptz,
  microsoft_email          text,
  scope                    text not null,
  last_synced_at           timestamptz,
  connected_at             timestamptz default now(),
  updated_at               timestamptz default now()
);

alter table microsoft_integrations enable row level security;
create policy "microsoft_integrations_own" on microsoft_integrations for all using (auth.uid() = user_id);

-- Dedup email già controllate, stessa idea di processed_gmail_messages.
create table processed_outlook_messages (
  user_id             uuid not null references profiles(id) on delete cascade,
  outlook_message_id  text not null,
  processed_at        timestamptz default now(),
  primary key (user_id, outlook_message_id)
);

alter table processed_outlook_messages enable row level security;
create policy "processed_outlook_messages_own" on processed_outlook_messages for all using (auth.uid() = user_id);

-- Collega l'appuntamento all'evento gemello creato su Outlook Calendar.
alter table appointments add column if not exists microsoft_event_id text;
