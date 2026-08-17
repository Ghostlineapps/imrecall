-- IMRECALL — 006: Row Level Security
-- Ogni utente vede e modifica esclusivamente i propri dati.

alter table profiles enable row level security;
alter table memories enable row level security;
alter table entities enable row level security;
alter table memory_entities enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table insights enable row level security;
alter table usage_logs enable row level security;
alter table places enable row level security;
alter table memory_places enable row level security;
alter table location_checkins enable row level security;
alter table deadlines enable row level security;
alter table resurface_candidates enable row level security;
alter table manual_recalls enable row level security;
alter table trips enable row level security;

create policy "profiles_own" on profiles for all using (auth.uid() = id);
create policy "memories_own" on memories for all using (auth.uid() = user_id and deleted_at is null);
create policy "entities_own" on entities for all using (auth.uid() = user_id);
create policy "chat_sessions_own" on chat_sessions for all using (auth.uid() = user_id);
create policy "chat_messages_own" on chat_messages for all using (auth.uid() = user_id);
create policy "insights_own" on insights for all using (auth.uid() = user_id);
create policy "usage_logs_own" on usage_logs for all using (auth.uid() = user_id);
create policy "places_own" on places for all using (auth.uid() = user_id);
create policy "location_checkins_own" on location_checkins for all using (auth.uid() = user_id);
create policy "deadlines_own" on deadlines for all using (auth.uid() = user_id);
create policy "resurface_candidates_own" on resurface_candidates for all using (auth.uid() = user_id);
create policy "manual_recalls_own" on manual_recalls for all using (auth.uid() = user_id);
create policy "trips_own" on trips for all using (auth.uid() = user_id);

-- memory_entities e memory_places non hanno user_id diretto: si verifica tramite join
create policy "memory_entities_own" on memory_entities for all using (
  exists (select 1 from memories m where m.id = memory_id and m.user_id = auth.uid())
);
create policy "memory_places_own" on memory_places for all using (
  exists (select 1 from memories m where m.id = memory_id and m.user_id = auth.uid())
);
