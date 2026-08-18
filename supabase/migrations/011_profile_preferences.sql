-- IMRECALL — 011: Preferenze di profilo (dieta + interessi)
--
-- Punto di partenza della funzione "consigli nei paraggi": l'utente indica
-- una volta sola le proprie restrizioni alimentari (es. vegano, celiaco) e i
-- propri interessi (es. arte, natura). Arrivando in una nuova città, l'app
-- userà questi valori per filtrare i luoghi vicini rilevanti (vedi
-- /api/places/nearby) invece di mostrare una lista generica come fanno i
-- competitor. Salvati come text[] (non una tabella a parte) perché sono
-- pochi valori da un set fisso, letti insieme al resto del profilo ad ogni
-- richiesta — non serve normalizzare.

alter table profiles
  add column if not exists dietary_preferences text[] default '{}',
  add column if not exists interests text[] default '{}';
