-- 030: fix nearby_memories / nearby_intentions (mai funzionanti da quando
-- create in 012_nearby_memories_function.sql).
--
-- Tre bug, scoperti scavando nei Postgres logs di Supabase dopo un controllo
-- tecnico su richiesta dell'utente (2026-09-02): ogni chiamata a queste due
-- funzioni (fatta da /api/checkin ad ogni apertura app) falliva a runtime,
-- ma l'errore veniva inghiottito silenziosamente lato Next.js (route.ts
-- ignora `error` da supabase.rpc(), tiene solo `data`), quindi l'app
-- rispondeva sempre 200 "candidates_created: 0" senza mai far emergere il
-- problema. Risultato: la funzione "torni in un posto legato a un ricordo/
-- intenzione e te lo ricordiamo" non ha mai prodotto un solo candidato.
--
-- Bug 1 (solo nearby_memories): la tabella memories era aliasata
-- "manual_recalls" nel FROM, ma tutto il resto del corpo funzione
-- continuava a referenziare l'alias "m" (select list, where, join) ->
-- "missing FROM-clause entry for table m" ad ogni chiamata.
--
-- Bug 2 (entrambe le funzioni): il filtro sulla distanza calcolata usava
-- HAVING invece di WHERE, senza alcun GROUP BY e con colonne non aggregate
-- nella select list -> "column m.id must appear in the GROUP BY clause or
-- be used in an aggregate function" ad ogni chiamata.
--
-- Bug 3 (entrambe le funzioni, scoperto durante la verifica del fix del Bug
-- 2): la colonna calcolata era aliasata "distance_km", stesso nome della
-- colonna di OUT param dichiarata in RETURNS TABLE(...). In PL/pgSQL i
-- parametri OUT diventano variabili implicite visibili in tutto il corpo
-- funzione, quindi il riferimento a "distance_km" nel WHERE/ORDER BY della
-- query flattenata risultava ambiguo tra la variabile e la colonna ->
-- "column reference distance_km is ambiguous". Rinominata la colonna
-- calcolata interna in "flt9x_dist" (e l'alias della subquery in "flt9x")
-- per evitare la collisione (il match con l'OUT param "distance_km" resta
-- comunque posizionale, grazie a "select * from (...) flt9x" dentro
-- "return query").
--
-- Fix: alias corretto in nearby_memories, HAVING sostituito con un WHERE
-- in una subquery esterna (una colonna calcolata in SELECT non è
-- referenziabile in WHERE nello stesso livello di query), e colonna
-- calcolata rinominata per evitare l'ambiguità col nome dell'OUT param.

create or replace function public.nearby_intentions(
  p_user_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 15
)
returns table(
  memory_id uuid,
  place_id uuid,
  place_name text,
  content text,
  memory_date timestamp with time zone,
  distance_km double precision
)
language plpgsql
as $function$
begin
  return query
  select * from (
    select
      m.id as memory_id,
      p.id as place_id,
      p.name as place_name,
      m.content,
      m.memory_date,
      (
        6371 * acos(
          cos(radians(p_latitude)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(p_longitude))
          + sin(radians(p_latitude)) * sin(radians(p.latitude))
        )
      ) as flt9x_dist
    from memories m
    join memory_places mp on mp.memory_id = m.id
    join places p on p.id = mp.place_id
    where m.user_id = p_user_id
      and m.is_intention = true
      and m.intention_status = 'pending'
      and m.deleted_at is null
      and p.latitude is not null
      and p.longitude is not null
  ) flt9x
  where flt9x.flt9x_dist < p_radius_km
  order by flt9x.flt9x_dist asc;
end;
$function$;

create or replace function public.nearby_memories(
  p_user_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 15
)
returns table(
  memory_id uuid,
  place_id uuid,
  place_name text,
  content text,
  memory_date timestamp with time zone,
  distance_km double precision
)
language plpgsql
as $function$
begin
  return query
  select * from (
    select
      m.id as memory_id,
      p.id as place_id,
      p.name as place_name,
      m.content,
      m.memory_date,
      (
        6371 * acos(
          cos(radians(p_latitude)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(p_longitude))
          + sin(radians(p_latitude)) * sin(radians(p.latitude))
        )
      ) as flt9x_dist
    from memories m
    join memory_places mp on mp.memory_id = m.id
    join places p on p.id = mp.place_id
    where m.user_id = p_user_id
      and m.deleted_at is null
      and not (m.is_intention = true and m.intention_status = 'pending')
      and p.latitude is not null
      and p.longitude is not null
  ) flt9x
  where flt9x.flt9x_dist < p_radius_km
  order by flt9x.flt9x_dist asc;
end;
$function$;
