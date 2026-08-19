-- IMRECALL — 013: nuovo tipo di memoria "document"
--
-- Serve per la nuova funzione di caricamento file (PDF, poi Word/Excel/
-- PowerPoint) — vedi /api/upload/document. ALTER TYPE ... ADD VALUE non può
-- essere usato nella stessa transazione in cui il nuovo valore viene anche
-- letto/scritto, quindi questa migrazione resta isolata (solo l'ALTER TYPE),
-- separata dalla 014 che tocca lo storage.

alter type memory_type add value if not exists 'document';
