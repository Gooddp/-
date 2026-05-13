create extension if not exists pgcrypto with schema extensions;

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  title text not null check (char_length(trim(title)) > 0),
  start_time time,
  end_time time,
  category text not null default '其他' check (category in ('学习', '工作', '生活', '其他')),
  status text not null default 'todo' check (status in ('todo', 'done')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists schedule_items_user_date_idx
  on public.schedule_items (user_id, date);

create index if not exists daily_reflections_user_date_idx
  on public.daily_reflections (user_id, date);

alter table public.schedule_items enable row level security;
alter table public.daily_reflections enable row level security;

drop policy if exists "Users can read own schedule items" on public.schedule_items;
drop policy if exists "Users can insert own schedule items" on public.schedule_items;
drop policy if exists "Users can update own schedule items" on public.schedule_items;
drop policy if exists "Users can delete own schedule items" on public.schedule_items;

create policy "Users can read own schedule items"
  on public.schedule_items for select
  using (auth.uid() = user_id);

create policy "Users can insert own schedule items"
  on public.schedule_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own schedule items"
  on public.schedule_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own schedule items"
  on public.schedule_items for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own reflections" on public.daily_reflections;
drop policy if exists "Users can insert own reflections" on public.daily_reflections;
drop policy if exists "Users can update own reflections" on public.daily_reflections;
drop policy if exists "Users can delete own reflections" on public.daily_reflections;

create policy "Users can read own reflections"
  on public.daily_reflections for select
  using (auth.uid() = user_id);

create policy "Users can insert own reflections"
  on public.daily_reflections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own reflections"
  on public.daily_reflections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own reflections"
  on public.daily_reflections for delete
  using (auth.uid() = user_id);
