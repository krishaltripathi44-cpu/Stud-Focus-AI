-- ============================================================================
-- Study Focus AI — AI System Enhancements Migration
-- Run this in your Supabase SQL Editor after 001_initial_schema.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add exam-related fields to subjects (difficulty, etc.)
-- ---------------------------------------------------------------------------
alter table public.subjects
  add column if not exists difficulty integer check (difficulty >= 1 and difficulty <= 5) default 3,
  add column if not exists exam_date date,
  add column if not exists exam_time time without time zone,
  add column if not exists exam_title text;

-- ---------------------------------------------------------------------------
-- 2. Add AI-specific fields to study_plans
-- ---------------------------------------------------------------------------
alter table public.study_plans
  add column if not exists version integer not null default 1,
  add column if not exists parent_plan_id uuid references public.study_plans(id) on delete set null,
  add column if not exists generation_prompt text,
  add column if not exists ai_reasoning text;

-- ---------------------------------------------------------------------------
-- 3. Add more fields to planned_sessions for richer scheduling
-- ---------------------------------------------------------------------------
alter table public.planned_sessions
  add column if not exists topic text,
  add column if not exists session_type text not null default 'focus' check (session_type in ('focus', 'break', 'review', 'exam_prep')),
  add column if not exists is_flexible boolean not null default false,
  add column if not exists exam_date_id uuid;

-- ---------------------------------------------------------------------------
-- 4. Create exam_dates table for multiple exam tracking
-- ---------------------------------------------------------------------------
create table if not exists public.exam_dates (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  exam_date date not null,
  exam_time time without time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Enable RLS
alter table public.exam_dates enable row level security;

create policy "Users can manage their own exam dates"
  on public.exam_dates for all using (auth.uid() = user_id);

create index idx_exam_dates_user on public.exam_dates(user_id);
create index idx_exam_dates_subject on public.exam_dates(subject_id);
create index idx_exam_dates_date on public.exam_dates(exam_date);

-- ---------------------------------------------------------------------------
-- 5. Add AI assistant actions log for audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.ai_assistant_actions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  action_type text not null,
  action_payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'executed', 'rejected', 'failed')),
  result jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  executed_at timestamp with time zone
);

alter table public.ai_assistant_actions enable row level security;

create policy "Users can manage their own AI assistant actions"
  on public.ai_assistant_actions for all using (auth.uid() = user_id);

create index idx_ai_actions_user on public.ai_assistant_actions(user_id);
create index idx_ai_actions_conversation on public.ai_assistant_actions(conversation_id);

-- ---------------------------------------------------------------------------
-- 6. Add updated_at trigger for exam_dates
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at_exam_dates()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_exam_dates on public.exam_dates;
create trigger set_updated_at_exam_dates
  before update on public.exam_dates
  for each row execute function public.set_updated_at_exam_dates();

-- ---------------------------------------------------------------------------
-- 7. Add helpful indexes for AI queries
-- ---------------------------------------------------------------------------
create index if not exists idx_planned_sessions_plan_status on public.planned_sessions(plan_id, status);
create index if not exists idx_study_logs_user_date_type on public.study_logs(user_id, date, session_type, completed);
create index if not exists idx_subjects_user_priority on public.subjects(user_id, priority, archived);

-- ---------------------------------------------------------------------------
-- 8. Add comment documentation
-- ---------------------------------------------------------------------------
comment on table public.exam_dates is 'User exam dates with times, linked to subjects for AI planning.';
comment on table public.ai_assistant_actions is 'Audit log of AI assistant proposed actions requiring user confirmation.';
comment on column public.subjects.difficulty is 'Subject difficulty 1-5 (1=easiest, 5=hardest) for AI workload balancing.';
comment on column public.subjects.exam_date is 'Legacy single exam date. Use exam_dates table for multiple exams.';
comment on column public.study_plans.version is 'Plan version for iterative regeneration.';
comment on column public.study_plans.parent_plan_id is 'Reference to previous plan version for history.';
comment on column public.study_plans.generation_prompt is 'The prompt/context sent to AI for reproducibility.';
comment on column public.study_plans.ai_reasoning is 'AI reasoning for the generated schedule.';
comment on column public.planned_sessions.topic is 'Specific topic/task for this study session.';
comment on column public.planned_sessions.session_type is 'Type of session: focus, break, review, exam_prep.';
comment on column public.planned_sessions.is_flexible is 'Whether this session can be auto-rescheduled by AI.';
