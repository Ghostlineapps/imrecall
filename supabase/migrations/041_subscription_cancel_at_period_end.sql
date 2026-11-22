-- IMRECALL — 041: disdetta abbonamento senza cancellare l'account
--
-- Richiesta utente (2026-11-22, durante il lavoro sulla cancellazione
-- account self-service): i Termini di Servizio promettono da tempo "puoi
-- disdire in qualsiasi momento dalle Impostazioni: la disdetta evita il
-- rinnovo successivo, ma resta attiva fino alla fine del periodo già
-- pagato" (src/app/terms/page.tsx, sezione "Piani, prezzi e pagamenti") —
-- ma prima di questa migrazione quella funzione non esisteva affatto: per
-- fermare un rinnovo l'unica strada reale era cancellare l'intero account
-- (src/app/api/user/account/route.ts) o scrivere all'assistenza.
--
-- cancel_at_period_end rispecchia il campo omonimo di Stripe
-- (stripe.subscriptions.update(id, {cancel_at_period_end: true})): quando
-- true, l'abbonamento resta attivo (e l'accesso Premium pure) fino alla
-- data in subscription_ends_at, poi Stripe lo chiude da solo e il webhook
-- "customer.subscription.deleted" (vedi src/app/api/webhooks/stripe/route.ts)
-- riporta il piano a "free". Non tocchiamo subscription_status/tier qui: lo
-- stato resta "active" per tutto il periodo già pagato, esattamente come
-- promesso nei Termini.
alter table profiles
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column profiles.cancel_at_period_end is
  'true se l''utente ha disdetto il rinnovo (stripe_subscription_id resta attivo fino a subscription_ends_at, poi il webhook subscription.deleted riporta il tier a free). Specchio del campo cancel_at_period_end di Stripe, scritto sia in modo ottimistico da /api/user/subscription sia dal webhook su ogni customer.subscription.updated.';
