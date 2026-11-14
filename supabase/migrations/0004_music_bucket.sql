begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'music',
  'music',
  false,
  16777216,
  array['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists music_authenticated_select on storage.objects;
drop policy if exists music_authenticated_insert on storage.objects;
drop policy if exists music_authenticated_update on storage.objects;
drop policy if exists music_authenticated_delete on storage.objects;

create policy music_authenticated_select
on storage.objects
for select
to authenticated
using (bucket_id = 'music' and auth.uid() is not null);

create policy music_authenticated_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'music' and auth.uid() is not null);

create policy music_authenticated_update
on storage.objects
for update
to authenticated
using (bucket_id = 'music' and auth.uid() is not null)
with check (bucket_id = 'music' and auth.uid() is not null);

create policy music_authenticated_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'music' and auth.uid() is not null);

commit;
