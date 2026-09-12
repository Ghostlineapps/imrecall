-- IMRECALL — 035: promemoria ricorrenti del giorno nel saluto in Home
--
-- Idea nata da un confronto su come rendere il saluto in Home più utile
-- senza cadere nello stesso problema evitato per Ciclo/Gravidanza: invece
-- di assumere per genere cosa serva ricordare a chi ("skincare il lunedì"
-- solo alle donne, per esempio), ogni utente sceglie da sé i propri
-- promemoria ricorrenti, uno per giorno della settimana, da un set di
-- chip pronte (Skincare, Parrucchiere/Barbiere, Bucato, Palestra, Spesa,
-- Spazzatura) oppure testo libero. Vedi src/app/(app)/settings/profile
-- per l'interfaccia e src/app/(app)/home/page.tsx per dove compare.
--
-- jsonb con default '{}' (non nullable): un utente che non ha mai
-- impostato nulla ha semplicemente un oggetto vuoto, nessun promemoria
-- mostrato — comportamento identico a prima di questa migration, senza
-- bisogno di backfill. Le chiavi sono le sigle inglesi dei giorni
-- (mon/tue/wed/thu/fri/sat/sun) per restare stabili indipendentemente
-- dalla lingua dell'interfaccia; i valori sono le etichette scelte
-- dall'utente (una chip predefinita o testo libero).
alter table profiles
  add column weekly_reminders jsonb not null default '{}'::jsonb;
