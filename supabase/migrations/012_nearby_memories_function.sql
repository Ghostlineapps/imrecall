-- IMRECALL — 012: nearby_memories()
--
-- nearby_intentions() (005_functions.sql) copre solo il caso "volevo andare
-- qui" (is_intention = true). Ma il caso d'uso originale del resurfacing —
-- fotografo un ristorante in Cina, ci torno davanti un anno dopo e l'app mi
-- ricorda "il giorno X dell'anno Y hai mangiato qui" — riguarda una memoria
-- passiva già vissuta, non un'intenzione aperta. nearby_memories() copre
-- quel caso: qualunque memoria collegata a un luogo (via memory_places),
-- esclusi solo le intenzioni ancora aperte (non ancora realizzate, quindi
-- non ha senso dire "eri qui" per qualcosa che deve ancora succedere).
create or replace function nearby_memories(
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
    and m.deleted_at is null
    and not (m.is_intention = true and m.intention_status = 'pending')
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
