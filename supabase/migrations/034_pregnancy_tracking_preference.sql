-- IMRECALL — 034: preferenza di visibilità per la sezione Gravidanza
--
-- Stesso principio della 033 (tracks_cycle): il pulsante "Gravidanza" nella
-- ruota della Dashboard (DashboardHub.tsx) oggi è mostrato sempre a tutti,
-- indipendentemente dal fatto che sia rilevante per chi lo guarda. Anziché
-- dedurlo dal sesso o da una cartella "Salute uomo/donna" (che richiederebbe
-- comunque di sapere a chi mostrare cosa), chiediamo direttamente l'intento
-- nello stesso step di onboarding già usato per il ciclo ("Un'ultima cosa"),
-- come seconda checkbox indipendente dalla prima.
--
-- Booleano nullable, non "not null default false": null = non ancora
-- chiesto (nuovo utente che deve ancora passare da /onboarding), true = sì,
-- false = no esplicito.
alter table profiles
  add column tracks_pregnancy boolean;

-- Backfill per chi esisteva già prima di questa migration, sullo stesso
-- principio della 029/033: un flag mai chiesto non deve tradursi in un
-- comportamento diverso per chi usa già l'app — il pulsante Gravidanza
-- resta visibile come prima di questa migration, finché non si decide
-- altrimenti da Impostazioni → Il tuo profilo. Il default per le righe
-- future (nuovi signup, da ora in poi) resta null: solo loro passeranno
-- dalla nuova domanda in /onboarding.
update profiles
set tracks_pregnancy = true
where tracks_pregnancy is null;
