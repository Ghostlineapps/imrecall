-- IMRECALL — 033: preferenza di visibilità del tracciamento ciclo
--
-- Richiesta dell'utente: la card "Ciclo" in home (migrazione 031) oggi è
-- mostrata come invito a chiunque, indipendentemente dal fatto che il
-- ciclo mestruale sia rilevante per la persona che usa l'app. Invece di
-- dedurlo da un dato demografico (il sesso — impreciso e più sensibile
-- del necessario: c'è chi non lo traccia più, chi si sente escluso da una
-- domanda binaria, e chi non ha il ciclo ma vuole comunque tracciare
-- quello di un'altra persona, es. un partner), chiediamo direttamente
-- l'unica cosa che serve davvero: vuoi vedere questa funzione?
--
-- Booleano nullable, non "not null default false": null = non ancora
-- chiesto (nuovo utente che deve ancora passare da /onboarding), true =
-- sì, false = no esplicito. La domanda viene posta una volta sola nel
-- flusso di onboarding (src/app/onboarding/page.tsx) e può essere
-- cambiata in qualsiasi momento da Impostazioni → Il tuo profilo.
alter table profiles
  add column tracks_cycle boolean;

-- Backfill per chi esisteva già prima di questa migration, sullo stesso
-- principio della 029 (onboarding_completed): un flag mai chiesto non deve
-- tradursi in un comportamento diverso per chi usa già l'app. Chi ha già
-- impostato il ciclo (una riga in cycle_settings) ovviamente lo vuole
-- vedere, ma anche per chiunque altro manteniamo il comportamento
-- attuale — la card resta visibile come invito, esattamente come prima
-- di questa migration — finché non decide altrimenti da Impostazioni.�Il
-- default per le righe future (nuovi signup, da ora in poi) resta null:
-- solo loro passeranno dalla nuova domanda in /onboarding.
update profiles
set tracks_cycle = true
where tracks_cycle is null;
