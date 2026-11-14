create extension if not exists pgcrypto;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  filename text not null
    check (char_length(filename) between 1 and 120)
    check (filename ~ '^[A-Za-z0-9._-]+\.(webp|jpe?g|png)$'),
  taken_at date not null,
  note text
    check (note is null or char_length(note) <= 140),
  storage_path text not null unique
    check (char_length(storage_path) between 1 and 240)
    check (storage_path ~ '^[A-Za-z0-9/._-]+$')
    check (position('..' in storage_path) = 0),
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null
    check (char_length(btrim(title)) between 1 and 30),
  body text not null
    check (char_length(btrim(body)) between 1 and 500),
  photo_id uuid references public.photos(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  text text not null
    check (char_length(btrim(text)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists photos_taken_at_idx
  on public.photos (taken_at desc, created_at desc);
create index if not exists memories_date_idx
  on public.memories (date desc, created_at desc);
create index if not exists messages_created_at_idx
  on public.messages (created_at desc);

alter table public.photos enable row level security;
alter table public.memories enable row level security;
alter table public.messages enable row level security;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'memories',
  'memories',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 开放策略统一放在 0002_storage_policy.sql。
