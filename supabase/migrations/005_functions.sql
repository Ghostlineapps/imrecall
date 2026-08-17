-- IMRECALL — 005: Funzioni RPC

create or replace function match_memories(
  query_embedding  vector(1536),
  match_threshold  float default 0.7,
  match_count      int default 5,
  p_user_id        uuid default null
)
returns table (
  id         uuid,
  content    text,
  title      text,
  type       memory_type,
  categories text[],
  tags       text[],
  memory_date timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    m.id, m.content, m.title, m.type, m.categories, m.tags, m.memory_date,
    1 - (m.embedding <=> query_embedding) as similarity
  from memories m
  where
    m.user_id = p_user_id
    and m.status = 'ready'
    and m.deleted_at is null
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Trova memorie/intenzioni vicine a un punto (raggio in metri), per il resurfacing
-- di prossimità. Usa formula haversine semplificata via cube/earthdistance in
-- produzione conviene abilitare l'estensione earthdistance; qui versione base.
create or replace function nearby_intentions(
  p_user_id    uuid,
  p_latitude   double precision,
  p_longitude  double precision,
  p_radius_km  float default 15
)
returns table (
  memory_id   uuid,
  place_id    uuid,
  place_name  text,
  content     text,
  memory_date timestamptz,
  distance_km float
)
language plpgsql
as $$
begin
  return query
  select
    m.id, p.id, p.name, m.content, m.memory_date,
    (
      6371 * acos(
        cos(radians(p_latitude)) * cos(radians(p.latitude)) *
        cos(radians(p.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(p.latitude))
      )
    ) as distance_km
  from memories m
  join memory_places mp on mp.memory_id = m.id
  join places p on p.id = mp.place_id
  where
    m.user_id = p_user_id
    and m.is_intention = true
    and m.intention_status = 'pending'
    and m.deleted_at is null
    and p.latitude is not null
    and p.longitude is not null
  having (
      6371 * acos(
        cos(radians(p_latitude)) * cos(radians(p.latitude)) *
        cos(radians(p.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(p.latitude))
      )
    ) < p_radius_km
  order by distance_km asc;
end;
$$;

-- Auto-crea profilo dopo signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Auto-updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger memories_updated_at before update on memories
  for each row execute function update_updated_at();
create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();
create trigger deadlines_updated_at before update on deadlines
  for each row execute function update_updated_at();

-- Genera automaticamente la prossima occorrenza quando una scadenza ricorrente
-- viene marcata completata
create or replace function spawn_next_deadline()
returns trigger language plpgsql as $$
declare
  next_due date;
begin
  if new.completed = true and old.completed = false and new.recurrence != 'none' then
    next_due := case new.recurrence
      when 'annual' then new.due_date + interval '1 year'
      when 'biennial' then new.due_date + interval '2 years'
      when 'monthly' then new.due_date + interval '1 month'
      else null
    end;

    if next_due is not null then
      insert into deadlines (user_id, title, category, due_date, recurrence, reminder_days_before, amount, notes)
      values (new.user_id, new.title, new.category, next_due, new.recurrence, new.reminder_days_before, new.amount, new.notes)
      returning id into new.next_occurrence_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger deadlines_spawn_next before update on deadlines
  for each row execute function spawn_next_deadline();

-- Aggiorna lo streak di cattura quando viene creata una memoria
create or replace function update_capture_streak()
returns trigger language plpgsql as $$
declare
  last_date date;
begin
  select last_capture_date into last_date from profiles where id = new.user_id;

  if last_date is null or last_date < current_date - interval '1 day' then
    -- streak interrotto o primo giorno
    update profiles set
      capture_streak_days = case when last_date = current_date - interval '1 day' then capture_streak_days + 1 else 1 end,
      last_capture_date = current_date
    where id = new.user_id;
  end if;

  return new;
end;
$$;

create trigger memories_update_streak after insert on memories
  for each row execute function update_capture_streak();
