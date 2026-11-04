-- ============================================================================
-- Study Focus AI — Database Schema
-- Run this in your Supabase SQL Editor.
-- ============================================================================

-- Enable UUID extension
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. profiles — extends auth.users with study preferences
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid references auth.users not null primary key,
  full_name text,
  avatar_url text,
  daily_goal_hours integer not null default 3 check (daily_goal_hours >= 0 and daily_goal_hours <= 12),
  timezone text not null default 'UTC',
  theme text not null default 'system' check (theme in ('light','dark','system')),
  email_notifications boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ---------------------------------------------------------------------------
-- 2. subjects — user's study subjects
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  description text,
  color text not null default '#8b5cf6',
  priority integer not null default 3 check (priority >= 1 and priority <= 5),
  weekly_target_hours numeric not null default 3 check (weekly_target_hours >= 0),
  archived boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ---------------------------------------------------------------------------
-- 3. study_plans — AI or manually generated study plans
-- ---------------------------------------------------------------------------
create table public.study_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  plan_date date not null,
  source text not null check (source in ('ai','fallback','manual')) default 'fallback',
  ai_model text,
  notes text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ---------------------------------------------------------------------------
-- 4. planned_sessions — individual study blocks within a plan
-- ---------------------------------------------------------------------------
create table public.planned_sessions (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid references public.study_plans(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  subject_id uuid references public.subjects(id) on delete set null,
  subject_name text not null,
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6),
  start_time text not null,  -- HH:MM
  end_time text not null,    -- HH:MM
  duration_minutes integer not null check (duration_minutes > 0),
  break_after boolean not null default true,
  status text not null default 'planned' check (status in ('planned','completed','skipped','missed')),
  order_index integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ---------------------------------------------------------------------------
-- 5. study_logs — actual completed / attempted study sessions (Pomodoro etc.)
-- ---------------------------------------------------------------------------
create table public.study_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  subject_id uuid references public.subjects(id) on delete set null,
  session_type text not null check (session_type in ('focus','break')),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  completed boolean not null default false,
  pomodoro_cycle integer,
  date date not null default (now() at time zone 'UTC')::date,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ---------------------------------------------------------------------------
-- 6. achievements — gamification badges earned by user
-- ---------------------------------------------------------------------------
create table public.achievements (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  description text,
  badge text not null,
  earned_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ---------------------------------------------------------------------------
-- 7. ai_conversations — chat sessions with the AI assistant
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null default 'New Conversation',
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ---------------------------------------------------------------------------
-- 8. ai_messages — messages in AI conversations
-- ---------------------------------------------------------------------------
create table public.ai_messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.ai_conversations(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ---------------------------------------------------------------------------
-- Indexes for common queries
-- ---------------------------------------------------------------------------
create index idx_subjects_user_id on public.subjects(user_id);
create index idx_subjects_user_archived on public.subjects(user_id, archived);
create index idx_study_plans_user_id on public.study_plans(user_id);
create index idx_planned_sessions_plan_id on public.planned_sessions(plan_id);
create index idx_planned_sessions_user_date on public.planned_sessions(user_id, day_of_week);
create index idx_study_logs_user_date on public.study_logs(user_id, date);
create index idx_study_logs_user_subject on public.study_logs(user_id, subject_id);
create index idx_achievements_user_id on public.achievements(user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — every user can only access their own data
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.study_plans enable row level security;
alter table public.planned_sessions enable row level security;
alter table public.study_logs enable row level security;
alter table public.achievements enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

-- Profiles
create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Users can delete their own profile"
  on public.profiles for delete using (auth.uid() = id);

-- Subjects
create policy "Users can manage their own subjects"
  on public.subjects for all using (auth.uid() = user_id);

-- Study plans
create policy "Users can manage their own study plans"
  on public.study_plans for all using (auth.uid() = user_id);

-- Planned sessions
create policy "Users can manage their own planned sessions"
  on public.planned_sessions for all using (auth.uid() = user_id);

-- Study logs
create policy "Users can manage their own study logs"
  on public.study_logs for all using (auth.uid() = user_id);

-- Achievements
create policy "Users can manage their own achievements"
  on public.achievements for all using (auth.uid() = user_id);

-- AI conversations
create policy "Users can manage their own AI conversations"
  on public.ai_conversations for all using (auth.uid() = user_id);

-- AI messages
create policy "Users can manage their own AI messages"
  on public.ai_messages for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

do $$
declare tbl text;
begin
  for tbl in
    select tablename from pg_tables where schemaname = 'public'
      and tablename in ('profiles','subjects','study_plans','planned_sessions','ai_conversations')
  loop
    execute format(
      'create trigger set_updated_at_%I before update on public.%I for each row execute function public.set_updated_at()',
      tbl, tbl
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Comment documentation
-- ---------------------------------------------------------------------------
comment on table public.subjects is 'User study subjects with priority, color, weekly targets.';
comment on table public.study_logs is 'Actual focus/break sessions completed by the user.';
comment on table public.study_plans is 'Generated (AI/fallback/manual) study plans.';
comment on table public.planned_sessions is 'Individual scheduled study blocks.';
comment on table public.ai_messages is 'AI assistant conversation messages (server-side AI).';
create index idx_ai_messages_conv on public.ai_messages(conversation_id);