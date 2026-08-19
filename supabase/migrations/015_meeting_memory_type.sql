-- IMRECALL — 015: nuovo tipo di memoria "meeting"
--
-- Registrazione di riunioni/call (Zoom/Teams/Meet, o anche di persona) via
-- microfono del dispositivo appoggiato vicino all'altoparlante — stessa
-- idea della nota vocale (audio), ma pensata per registrazioni lunghe
-- (fino a decine di minuti) con trascrizione integrale, riassunto e
-- "esplosione" dei temi trattati. Vedi /api/upload/meeting.
--
-- Nessuna nuova migrazione di storage: le registrazioni riusano il bucket
-- "audio" e le sue policy RLS già create in 008_storage.sql (stesso schema
-- di path ${user.id}/..., nessuna distinzione per tipo di memoria).
--
-- ALTER TYPE ... ADD VALUE non può essere usato nella stessa transazione in
-- cui il nuovo valore viene anche letto/scritto, quindi questa migrazione
-- resta isolata (come la 013 per il tipo "document").

alter type memory_type add value if not exists 'meeting';
