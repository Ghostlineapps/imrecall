-- IMRECALL — 022: sezione Spese (nota spese da scontrini + budget mensile)
--
-- Richiesta dell'utente ("andiamo avanti con budget e nota spese?"), già
-- annunciata come "prossimamente" nel post Instagram del 20/08. Stesso
-- schema architetturale della sezione Salute (migrazione 020): non è una
-- nuova categorizzazione dei ricordi, ma un punto d'ingresso dedicato.
--
-- A differenza di Salute però le spese hanno dati strutturati propri
-- (importo, negozio, categoria, data) che non ha senso tenere solo dentro
-- il testo libero di una memoria — servono per calcolare il totale del
-- mese e confrontarlo col budget. Stessa scelta architetturale già fatta
-- per farmaci/appuntamenti/scadenze: tabella dedicata, collegata alla
-- eventuale foto dello scontrino tramite memory_id.
--
-- is_expense su "memories" segue lo stesso scopo di is_health: distinguere
-- SOLO cosa mostrare nella pagina /expenses (le foto/file caricati da lì),
-- senza toccare la ricerca generica né introdurre una categorizzazione.
alter table memories add column is_expense boolean not null default false;

create index idx_memories_is_expense on memories (user_id, is_expense) where is_expense = true;

create table expenses (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  memory_id     uuid references memories(id) on delete set null,  -- collegato allo scontrino fotografato, se rilevato da foto
  vendor        text,
  amount        numeric(10,2) not null,
  category      text not null default 'altro',  -- spesa|trasporti|ristorazione|casa|salute|svago|altro
  expense_date  date not null default current_date,
  source        text not null default 'manual',  -- 'manual' | 'photo'
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_expenses_user_date on expenses (user_id, expense_date);

alter table expenses enable row level security;

create policy "expenses_own" on expenses for all using (auth.uid() = user_id);

-- Budget mensile totale (non per categoria, per restare semplice in questa
-- prima versione): una singola cifra, confrontata lato client col totale
-- speso nel mese corrente per mostrare una barra di avanzamento e un avviso
-- quando ci si avvicina o si supera la soglia.
alter table profiles add column monthly_budget numeric(10,2);
