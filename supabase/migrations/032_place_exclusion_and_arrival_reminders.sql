-- IMRECALL — 032: escludi luoghi dal resurfacing di prossimità + promemoria
-- di arrivo "usa e getta"
--
-- Segnalato dall'utente il 2026-09-10: "Casa" salvata in Impostazioni →
-- Luoghi ricompariva continuamente come "Sei di nuovo qui" perché places
-- non ha (e non aveva) alcun modo di dire "questo luogo non serve
-- ricordarlo, ci vivo" — per il motore di resurfacing un indirizzo di casa
-- è identico a un ristorante visto una volta in un altro paese. In più,
-- l'unico filtro anti-duplicato in /api/checkin è "non ricreare se c'è già
-- un candidato in coda non ancora mostrato": appena il candidato viene
-- mostrato in home (marcato sent=true per il limite "1 al giorno"), il
-- check-in successivo (che scatta spesso: ogni apertura app, ogni 100m di
-- spostamento anche per solo jitter GPS, o comunque ogni 3 minuti come
-- rete di sicurezza mentre l'app resta aperta — vedi useLocationCheckin.ts)
-- ne crea semplicemente uno nuovo per la stessa memoria.
--
-- excluded_from_resurfacing risolve il problema alla radice invece di
-- aggiungere un ennesimo cooldown temporale: filtrato lato applicazione in
-- /api/checkin (non nelle funzioni SQL nearby_memories/nearby_intentions,
-- già passate per tre round di bug — vedi 030_fix_nearby_functions.sql —
-- meglio non toccarle di nuovo se non serve).
alter table places
  add column excluded_from_resurfacing boolean not null default false;

-- Promemoria "quando arrivo a [luogo], ricordami di [testo]" (es. "quando
-- arrivo a casa oggi ricordami di innaffiare le piante"). A differenza
-- delle intenzioni (memories con is_intention=true — "voglio tornare al
-- ristorante X"), che restano aperte finché l'utente non le completa
-- manualmente e competono per l'unico slot giornaliero di TodayCard,
-- questo è pensato per essere usa-e-getta: legato a UN luogo già salvato,
-- si spegne da solo (triggered = true) al primo arrivo entro raggio e
-- arriva anche come notifica push (vedi sendPushToUser in
-- /api/checkin/route.ts), non solo se l'utente riapre l'app.
create table arrival_reminders (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references profiles(id) on delete cascade,
  place_id     uuid not null references places(id) on delete cascade,
  message      text not null,
  triggered    boolean not null default false,
  triggered_at timestamptz,
  created_at   timestamptz default now()
);

create index arrival_reminders_pending_idx on arrival_reminders (user_id, triggered)
  where triggered = false;

-- Stessa convenzione di 006_rls.sql: una sola policy "for all", non una per
-- comando.
alter table arrival_reminders enable row level security;

create policy "arrival_reminders_own" on arrival_reminders for all using (auth.uid() = user_id);
