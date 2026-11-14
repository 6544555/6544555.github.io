begin;

drop policy if exists photos_public_access on public.photos;
drop policy if exists memories_public_access on public.memories;
drop policy if exists messages_public_access on public.messages;
drop policy if exists memories_bucket_select on storage.objects;
drop policy if exists memories_bucket_insert on storage.objects;
drop policy if exists memories_bucket_update on storage.objects;
drop policy if exists memories_bucket_delete on storage.objects;
drop policy if exists photos_allowed_users on public.photos;
drop policy if exists memories_allowed_users on public.memories;
drop policy if exists messages_allowed_users on public.messages;
drop policy if exists memories_allowed_select on storage.objects;
drop policy if exists memories_allowed_insert on storage.objects;
drop policy if exists memories_allowed_update on storage.objects;
drop policy if exists memories_allowed_delete on storage.objects;
drop policy if exists photos_authenticated_access on public.photos;
drop policy if exists memories_authenticated_access on public.memories;
drop policy if exists messages_authenticated_access on public.messages;
drop policy if exists memories_authenticated_select on storage.objects;
drop policy if exists memories_authenticated_insert on storage.objects;
drop policy if exists memories_authenticated_update on storage.objects;
drop policy if exists memories_authenticated_delete on storage.objects;

drop function if exists public.is_allowed_user();
drop table if exists public.allowed_users;

revoke all on table public.photos from anon;
revoke all on table public.memories from anon;
revoke all on table public.messages from anon;
grant select, insert, update, delete on table public.photos to authenticated;
grant select, insert, update, delete on table public.memories to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;

create policy photos_authenticated_access
on public.photos
for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy memories_authenticated_access
on public.memories
for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy messages_authenticated_access
on public.messages
for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy memories_authenticated_select
on storage.objects
for select
to authenticated
using (bucket_id = 'memories' and auth.uid() is not null);

create policy memories_authenticated_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'memories' and auth.uid() is not null);

create policy memories_authenticated_update
on storage.objects
for update
to authenticated
using (bucket_id = 'memories' and auth.uid() is not null)
with check (bucket_id = 'memories' and auth.uid() is not null);

create policy memories_authenticated_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'memories' and auth.uid() is not null);

commit;
