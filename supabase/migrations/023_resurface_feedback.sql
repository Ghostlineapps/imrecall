-- IMRECALL — 023: feedback utente su "Just Became Relevant"
--
-- La card di resurfacing in home (TodayCard.tsx, tabella
-- resurface_candidates) non aveva alcun modo per l'utente di segnalare se
-- una card mostrata era utile o no: `dismissed` esisteva già in schema ma
-- non era collegata a nessun controllo in UI, quindi restava sempre false.
-- Aggiunta una colonna `feedback` esplicita: il segnale utile/non utile
-- viene ora registrato per ogni candidato mostrato — prerequisito per poter
-- un domani pesare `priority_score` sul comportamento reale dell'utente,
-- invece che sulla sola regola fissa per tipo usata oggi (vedi
-- /api/checkin/route.ts e /api/cron/insights/route.ts).
alter table resurface_candidates
  add column feedback text check (feedback in ('useful', 'not_useful'));
