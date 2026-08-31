-- IMRECALL — 028: spazio "Gravidanza"
--
-- Stessa filosofia di is_health (migrazione 020) e is_expense (022): non è
-- una nuova categorizzazione parallela né un sistema di condivisione tra
-- account. È solo un'etichetta che permette di raggruppare in un'unica
-- vista appuntamenti, referti/esami e scadenze che riguardano una
-- gravidanza specifica dell'utente che la crea nel proprio account,
-- riusando gli stessi motori di promemoria già esistenti (push/email per
-- appuntamenti e scadenze) invece di costruirne di nuovi.

-- Una riga per gravidanza: la data presunta del parto è il solo dato
-- indispensabile, da cui calcoliamo settimana corrente e countdown lato
-- applicazione (nessuna colonna calcolata: la formula è semplice e così
-- resta facile da cambiare senza migrazioni).
create table pregnancies (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  due_date   date not null,
  notes      text,
  created_at timestamptz default now()
);

create index idx_pregnancies_user on pregnancies (user_id);

alter table pregnancies enable row level security;
create policy "pregnancies_own" on pregnancies for all using (auth.uid() = user_id);

-- Referti/esami: stesso pattern di is_health, un flag booleano sui
-- ricordi esistenti invece di una tabella parallela.
alter table memories add column is_pregnancy boolean not null default false;
create index idx_memories_is_pregnancy on memories (user_id, is_pregnancy) where is_pregnancy = true;

-- Appuntamenti: "category" distingue le visite specialistiche (valore
-- 'visita_specialistica') dal resto degli appuntamenti legati alla
-- gravidanza (category null) — non è un enum per restare libera anche per
-- usi futuri fuori dallo spazio Gravidanza, esattamente come "notes" o
-- "location" sulla stessa tabella.
alter table appointments add column is_pregnancy boolean not null default false;
alter table appointments add column category text;

-- Scadenze (es. "ripetere l'esame tra 3 settimane"): riusa interamente il
-- motore di promemoria già attivo in /api/cron/insights, nessuna nuova
-- logica di invio.
alter table deadlines add column is_pregnancy boolean not null default false;

-- Checklist libera ("da preparare"): non è legata alle altre tabelle,
-- viene creata (con qualche voce di partenza) quando l'utente imposta la
-- data del parto — vedi /api/pregnancy.
create table pregnancy_checklist_items (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  label      text not null,
  done       boolean not null default false,
  created_at timestamptz default now()
);

create index idx_pregnancy_checklist_user on pregnancy_checklist_items (user_id);

alter table pregnancy_checklist_items enable row level security;
create policy "pregnancy_checklist_items_own" on pregnancy_checklist_items for all using (auth.uid() = user_id);
