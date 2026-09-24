-- IMRECALL — 038: Collegamento Telegram
-- Bot Telegram come canale di cattura a zero frizione (testo + note vocali)
-- in aggiunta all'app — scelto come primo canale di messaggistica da
-- validare, prima di WhatsApp: l'API bot di Telegram è gratuita e non
-- richiede verifica aziendale né approvazione dei messaggi, a differenza
-- della Cloud API di WhatsApp Business.
--
-- Un utente ImRecall può avere al massimo una chat Telegram collegata:
-- colonna diretta su profiles, stesso pattern già usato per le altre
-- preferenze 1:1 (tracks_cycle, daily_capture_reminder_enabled ecc.)
-- invece di una tabella a parte.
alter table profiles
  add column telegram_chat_id bigint unique,
  -- Codice monouso a breve scadenza (10 minuti, vedi /api/telegram/link)
  -- che l'utente manda al bot con "/start <codice>" per collegare la chat
  -- al proprio account — non riusiamo l'id utente direttamente per non
  -- esporlo in un link condivisibile.
  add column telegram_link_code text,
  add column telegram_link_code_expires_at timestamptz;
