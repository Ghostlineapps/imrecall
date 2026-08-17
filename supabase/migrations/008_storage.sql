-- IMRECALL — 008: Bucket di Storage per foto e audio delle memorie
--
-- Mancavano del tutto: le route /api/upload/image e /api/upload/audio
-- caricano su bucket "images" e "audio" che non erano mai stati creati,
-- quindi ogni upload falliva silenziosamente prima ancora di salvare la
-- memoria (e di conseguenza prima di poter rilevare eventuali scadenze).

insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

create policy "Users can upload their own images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view their own images"
  on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload their own audio"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view their own audio"
  on storage.objects for select to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own audio"
  on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
