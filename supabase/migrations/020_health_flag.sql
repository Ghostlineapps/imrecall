-- IMRECALL — 020: sezione Salute (flag is_health sui ricordi)
--
-- La sezione Salute NON introduce una nuova categorizzazione né tocca la
-- ricerca: serve solo come punto d'ingresso visibile per far capire
-- all'utente che può caricare referti (esami del sangue, visite
-- specialistiche...) come foto o file — cosa che, senza questa sezione,
-- nessuno penserebbe di fare. La ricerca generica continua a funzionare
-- come prima su TUTTI i ricordi, etichettati o meno.
--
-- is_health distingue solo COSA MOSTRARE nella pagina /health:
--   - foto/file caricati dal "+" della sezione Salute (ImageCapture /
--     DocumentCapture con isHealth=true — vedi CaptureSheet in healthMode)
--   - ogni farmaco (i farmaci sono per natura sempre "salute", a
--     prescindere da dove sono stati aggiunti — vedi /api/medications)
alter table memories add column is_health boolean not null default false;

create index idx_memories_is_health on memories (user_id, is_health) where is_health = true;
