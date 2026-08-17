-- IMRECALL — 007: Estende location_checkins per tracciamento continuo e
-- import della cronologia spostamenti di Google Maps.
--
-- La tabella esisteva già (usata da /api/checkin per il resurfacing di
-- prossimità): qui la arricchiamo per poterla riusare anche come log storico
-- degli spostamenti, senza duplicare infrastruttura (RLS, indici già presenti).

alter table location_checkins
  add column if not exists source text not null default 'checkin'; -- 'checkin' | 'live' | 'import'

alter table location_checkins
  add column if not exists accuracy double precision;

alter table location_checkins
  add column if not exists place_name text;

alter table location_checkins
  add column if not exists recorded_at timestamptz not null default now();

create index if not exists idx_location_checkins_user_recorded
  on location_checkins (user_id, recorded_at desc);
