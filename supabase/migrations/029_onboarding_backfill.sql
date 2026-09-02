-- IMRECALL — 029: backfill onboarding_completed per gli utenti esistenti
--
-- La colonna profiles.onboarding_completed esiste fin dalla 002 (default
-- false) ma non è mai stata letta né scritta da nessun codice: è rimasta
-- un flag morto. 2026-09-02: la usiamo per il nuovo flusso di onboarding
-- (/onboarding) mostrato ai nuovi utenti subito dopo la registrazione,
-- come primo "momento wow" (importano Google Maps/foto e vedono subito un
-- ricordo reale). Senza questo backfill, TUTTI gli utenti già esistenti
-- (onboarding_completed = false di default, mai impostato) verrebbero
-- reindirizzati a /onboarding al prossimo accesso — un'esperienza pensata
-- solo per chi si registra da ora in poi. Segniamo quindi come "già fatto"
-- chiunque abbia un account creato prima di questa migration; il default
-- false resta invariato per le righe future (nuovi signup).

update profiles
set onboarding_completed = true
where onboarding_completed = false;
