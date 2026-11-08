-- IMRECALL — 039: recupero appuntamenti persi durante un'interruzione del
-- sync Gmail/Outlook + stato "da ricollegare" distinto da "collegato"
--
-- Richiesta utente (2026-11-08), dopo aver scoperto che il sync Gmail era
-- rotto in silenzio dal 2026-09-01 (refresh token Google scaduto,
-- invalid_grant — vedi commento in src/lib/google/client.ts): l'utente ha
-- fatto notare giustamente che non basta far ripartire il sync da adesso,
-- altrimenti tutti gli appuntamenti arrivati via email durante l'interruzione
-- (incluse le conferme volo+hotel per Berlino che hanno fatto scoprire il
-- bug) restano persi per sempre e tocca all'utente recuperarli a mano.
--
-- Soluzione: quando il refresh del token fallisce in modo permanente
-- (invalid_grant), NON cancelliamo più la riga di google_integrations (come
-- faceva il fix precedente) — la marchiamo con reauth_required = true e
-- lasciamo last_synced_at com'era all'ultimo sync riuscito. Quando l'utente
-- ricollega Gmail, il callback OAuth vede che last_synced_at è più vecchio
-- di "adesso" e riparte da lì (non da "adesso") per recuperare tutto quello
-- che è arrivato nel frattempo — con un tetto di sicurezza di 90 giorni,
-- per non scatenare una scansione a tempo indeterminato della casella.
alter table google_integrations add column if not exists reauth_required boolean not null default false;
alter table microsoft_integrations add column if not exists reauth_required boolean not null default false;

comment on column google_integrations.reauth_required is
  'true quando il refresh del token è fallito in modo permanente (invalid_grant): il sync è sospeso finché l''utente non ricollega da Impostazioni. La UI (/api/integrations/google/status) riporta connected=false in questo stato, pur mantenendo la riga (e last_synced_at) per poter recuperare retroattivamente al ricollegamento.';
comment on column microsoft_integrations.reauth_required is
  'Gemello di google_integrations.reauth_required per Outlook — vedi lì.';
