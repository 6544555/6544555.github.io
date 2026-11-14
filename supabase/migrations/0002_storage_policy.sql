do $x$
begin
  -- Historical migration guard: once 0003 is applied, rerunning this file must not reopen anonymous access.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'photos'
      and policyname = 'photos_authenticated_access'
  ) then
    raise notice '0002 skipped because the authenticated access migration is active';
    return;
  end if;

  if (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename = 'photos'
      and policyname = 'photos_public_access'
  ) = 0 then
    execute 'create policy "photos_public_access" on public.photos for all to anon, authenticated using (true) with check (true)';
  end if;

  if (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename = 'memories'
      and policyname = 'memories_public_access'
  ) = 0 then
    execute 'create policy "memories_public_access" on public.memories for all to anon, authenticated using (true) with check (true)';
  end if;

  if (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_public_access'
  ) = 0 then
    execute 'create policy "messages_public_access" on public.messages for all to anon, authenticated using (true) with check (true)';
  end if;

  if (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'memories_bucket_select'
  ) = 0 then
    execute 'create policy "memories_bucket_select" on storage.objects for select to anon, authenticated using (bucket_id = ''memories'')';
  end if;

  if (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'memories_bucket_insert'
  ) = 0 then
    execute 'create policy "memories_bucket_insert" on storage.objects for insert to anon, authenticated with check (bucket_id = ''memories'')';
  end if;

  if (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'memories_bucket_update'
  ) = 0 then
    execute 'create policy "memories_bucket_update" on storage.objects for update to anon, authenticated using (bucket_id = ''memories'') with check (bucket_id = ''memories'')';
  end if;

  if (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'memories_bucket_delete'
  ) = 0 then
    execute 'create policy "memories_bucket_delete" on storage.objects for delete to anon, authenticated using (bucket_id = ''memories'')';
  end if;
end
$x$;
