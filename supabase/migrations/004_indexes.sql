-- IMRECALL — 004: Indici

-- Memories
create index idx_memories_user_id on memories(user_id);
create index idx_memories_user_date on memories(user_id, memory_date desc);
create index idx_memories_user_status on memories(user_id, status);
create index idx_memories_type on memories(user_id, type);
create index idx_memories_deleted on memories(deleted_at) where deleted_at is null;
create index idx_memories_intention on memories(user_id, intention_status) where is_intention = true;

-- On-this-day: query per mese/giorno indipendente dall'anno
create index idx_memories_month_day on memories(user_id, (extract(month from memory_date)), (extract(day from memory_date)));

create index idx_memories_fts on memories
  using gin(to_tsvector('italian', coalesce(content, '') || ' ' || coalesce(title, '')));

create index idx_memories_tags on memories using gin(tags);
create index idx_memories_categories on memories using gin(categories);

create index idx_memories_embedding on memories
  using hnsw(embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Chat
create index idx_chat_messages_session on chat_messages(session_id, created_at);
create index idx_insights_user_date on insights(user_id, insight_date desc);

-- Resurfacing
create index idx_places_user on places(user_id);
create index idx_memory_places_place on memory_places(place_id);
create index idx_location_checkins_user_date on location_checkins(user_id, created_at desc);
create index idx_deadlines_user_due on deadlines(user_id, due_date) where completed = false;
create index idx_resurface_candidates_pending on resurface_candidates(user_id, sent, priority_score desc) where sent = false and dismissed = false;
create index idx_manual_recalls_pending on manual_recalls(user_id, recall_at) where triggered = false;
create index idx_trips_upcoming on trips(user_id, start_date) where digest_sent = false;
