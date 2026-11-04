-- ============================================================================
-- Study Focus AI — Complete Incremental Migration
-- Adds missing enhancements from 002_ai_enhancements.sql and 003_ai_usage_logs.sql
-- to an existing database with 8 tables from 001_initial_schema.sql.
-- Run in Supabase SQL Editor. Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Enable UUID extension (idempotent)
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ============================================================================
-- 1. ADD MISSING COLUMNS TO EXISTING TABLES (from 002)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 subjects: exam-related fields
-- ---------------------------------------------------------------------------
alter table public.subjects
  add column if not exists difficulty integer check (difficulty >= 1 and difficulty <= 5) default 3,
  add column if not exists exam_date date,
  add column if not exists exam_time time without time zone,
  add column if not exists exam_title text;

-- ---------------------------------------------------------------------------
-- 1.2 study_plans: AI-specific fields
-- ---------------------------------------------------------------------------
alter table public.study_plans
  add column if not exists version integer not null default 1,
  add column if not exists parent_plan_id uuid references public.study_plans(id) on delete set null,
  add column if not exists generation_prompt text,
  add column if not exists ai_reasoning text;

-- ---------------------------------------------------------------------------
-- 1.3 planned_sessions: richer scheduling fields
-- ---------------------------------------------------------------------------
alter table public.planned_sessions
  add column if not exists topic text,
  add column if not exists session_type text not null default 'focus' check (session_type in ('focus', 'break', 'review', 'exam_prep')),
  add column if not exists is_flexible boolean not null default false,
  add column if not exists exam_date_id uuid;

-- ============================================================================
-- 2. CREATE MISSING TABLES (from 002 + 003)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 exam_dates: multiple exam tracking (from 002)
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

alter table public.exam_dates enable row level security;

drop policy if exists "Users can manage their own exam dates" on public.exam_dates;
create policy "Users can manage their own exam dates"
  on public.exam_dates for all using (auth.uid() = user_id);

create index if not exists idx_exam_dates_user on public.exam_dates(user_id);
create index if not exists idx_exam_dates_subject on public.exam_dates(subject_id);
create index if not exists idx_exam_dates_date on public.exam_dates(exam_date);

-- ---------------------------------------------------------------------------
-- 2.1.1 Add FK for planned_sessions.exam_date_id -> exam_dates(id)
--     (002 added the column but omitted the FK; adding it now safely)
--     Must come AFTER exam_dates table exists
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'planned_sessions_exam_date_id_fkey'
      and table_name = 'planned_sessions'
  ) then
    alter table public.planned_sessions
      add constraint planned_sessions_exam_date_id_fkey
      foreign key (exam_date_id) references public.exam_dates(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2.2 ai_assistant_actions: audit trail for AI actions (from 002)
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

drop policy if exists "Users can manage their own AI assistant actions" on public.ai_assistant_actions;
create policy "Users can manage their own AI assistant actions"
  on public.ai_assistant_actions for all using (auth.uid() = user_id);

create index if not exists idx_ai_actions_user on public.ai_assistant_actions(user_id);
create index if not exists idx_ai_actions_conversation on public.ai_assistant_actions(conversation_id);

-- ---------------------------------------------------------------------------
-- 2.3 ai_usage_logs: AI API usage tracking (from 003 - SECURED)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  feature text not null check (feature in ('planner', 'assistant')),
  model text not null,
  status text not null check (status in ('success', 'error', 'rate_limited', 'timeout', 'insufficient_credits', 'invalid_model')),
  latency_ms integer not null,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(10, 6),
  error_message text,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.ai_usage_logs enable row level security;

drop policy if exists "Users can view their own AI usage logs" on public.ai_usage_logs;
create policy "Users can view their own AI usage logs"
  on public.ai_usage_logs for select using (auth.uid() = user_id);

-- NO INSERT POLICY: Edge Functions use service_role key which bypasses RLS
drop policy if exists "System can insert AI usage logs" on public.ai_usage_logs;

-- GRANT SELECT on base table for security_invoker view to work
grant select on public.ai_usage_logs to authenticated;

create index if not exists idx_ai_usage_logs_user on public.ai_usage_logs(user_id);
create index if not exists idx_ai_usage_logs_feature on public.ai_usage_logs(feature);
create index if not exists idx_ai_usage_logs_created on public.ai_usage_logs(created_at desc);
create index if not exists idx_ai_usage_logs_conversation on public.ai_usage_logs(conversation_id);
create index if not exists idx_ai_usage_logs_status on public.ai_usage_logs(status);

-- ---------------------------------------------------------------------------
-- 2.4 user_ai_usage_summary: secure aggregated view (security_invoker) (from 003)
-- ---------------------------------------------------------------------------
create or replace view public.user_ai_usage_summary
with (security_invoker = true) as
select
  user_id,
  feature,
  model,
  count(*) as request_count,
  sum(case when status = 'success' then 1 else 0 end) as success_count,
  sum(case when status != 'success' then 1 else 0 end) as error_count,
  sum(latency_ms) as total_latency_ms,
  avg(latency_ms)::numeric(10, 2) as avg_latency_ms,
  sum(coalesce(prompt_tokens, 0)) as total_prompt_tokens,
  sum(coalesce(completion_tokens, 0)) as total_completion_tokens,
  sum(coalesce(total_tokens, 0)) as total_tokens,
  sum(coalesce(estimated_cost_usd, 0)) as total_estimated_cost_usd,
  max(created_at) as last_request_at
from public.ai_usage_logs
where user_id = auth.uid()
group by user_id, feature, model;

grant select on public.user_ai_usage_summary to authenticated;

-- ============================================================================
-- 3. ADD MISSING INDEXES (from 002)
-- ============================================================================

create index if not exists idx_planned_sessions_plan_status on public.planned_sessions(plan_id, status);
create index if not exists idx_study_logs_user_date_type on public.study_logs(user_id, date, session_type, completed);
create index if not exists idx_subjects_user_priority on public.subjects(user_id, priority, archived);

-- ============================================================================
-- 4. ADD MISSING TRIGGERS (from 002: exam_dates only)
-- ============================================================================

-- updated_at trigger for exam_dates (001 loop did NOT include exam_dates)
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

-- ============================================================================
-- 5. PRESERVE EXISTING RLS POLICIES ON 8 TABLES FROM 001
--     (Do NOT drop/recreate -- they already exist and are correct)
-- ============================================================================
-- Existing tables with RLS already enabled and policies in place:
-- profiles, subjects, study_plans, planned_sessions, study_logs,
-- achievements, ai_conversations, ai_messages
-- Policies: "Users can manage their own <table>" using (auth.uid() = user_id)
--           or (auth.uid() = id) for profiles
-- No action needed here.

-- ============================================================================
-- 6. PRESERVE EXISTING UPDATED_AT TRIGGERS ON 5 TABLES FROM 001
--     (Do NOT modify -- they already exist. exam_dates gets its own above.)
-- ============================================================================
-- Existing trigger loop from 001 covers:
-- profiles, subjects, study_plans, planned_sessions, ai_conversations
-- Function: public.set_updated_at()
-- No action needed here.

-- ============================================================================
-- 7. PRESERVE EXISTING AUTH TRIGGER FROM 001
--     (Do NOT drop/recreate -- handle_new_user() and on_auth_user_created
--      already exist from the original migration)
-- ============================================================================
-- No action needed here.

-- ============================================================================
-- 8. COMMENT DOCUMENTATION (from 001 + 002 + 003)
-- ============================================================================

comment on table public.subjects is 'User study subjects with priority, color, weekly targets.';
comment on table public.study_logs is 'Actual focus/break sessions completed by the user.';
comment on table public.study_plans is 'Generated (AI/fallback/manual) study plans.';
comment on table public.planned_sessions is 'Individual scheduled study blocks.';
comment on table public.ai_messages is 'AI assistant conversation messages (server-side AI).';
comment on table public.exam_dates is 'User exam dates with times, linked to subjects for AI planning.';
comment on table public.ai_assistant_actions is 'Audit log of AI assistant proposed actions requiring user confirmation.';
comment on table public.ai_usage_logs is 'Audit log of AI API requests for cost tracking, debugging, and rate limiting.';

comment on column public.subjects.difficulty is 'Subject difficulty 1-5 (1=easiest, 5=hardest) for AI workload balancing.';
comment on column public.subjects.exam_date is 'Legacy single exam date. Use exam_dates table for multiple exams.';
comment on column public.study_plans.version is 'Plan version for iterative regeneration.';
comment on column public.study_plans.parent_plan_id is 'Reference to previous plan version for history.';
comment on column public.study_plans.generation_prompt is 'The prompt/context sent to AI for reproducibility.';
comment on column public.study_plans.ai_reasoning is 'AI reasoning for the generated schedule.';
comment on column public.planned_sessions.topic is 'Specific topic/task for this study session.';
comment on column public.planned_sessions.session_type is 'Type of session: focus, break, review, exam_prep.';
comment on column public.planned_sessions.is_flexible is 'Whether this session can be auto-rescheduled by AI.';

comment on column public.ai_usage_logs.feature is 'Which AI feature made the request: planner or assistant.';
comment on column public.ai_usage_logs.model is 'The AI model used (e.g., openai/gpt-4o-mini).';
comment on column public.ai_usage_logs.status is 'Request outcome: success, error, rate_limited, timeout, insufficient_credits, invalid_model.';
comment on column public.ai_usage_logs.latency_ms is 'Request latency in milliseconds.';
comment on column public.ai_usage_logs.prompt_tokens is 'Input tokens sent to the model.';
comment on column public.ai_usage_logs.completion_tokens is 'Output tokens generated by the model.';
comment on column public.ai_usage_logs.total_tokens is 'Total tokens (prompt + completion).';
comment on column public.ai_usage_logs.estimated_cost_usd is 'Estimated cost in USD based on model pricing.';
comment on column public.ai_usage_logs.error_message is 'Error details when status != success (no sensitive data).';
comment on column public.ai_usage_logs.conversation_id is 'Link to conversation for assistant requests.';
comment on view public.user_ai_usage_summary is 'Aggregated AI usage per user, feature, and model for dashboard display.';

-- ============================================================================
-- 9. EXISTING INDEX FROM 001 (ensure it exists)
-- ============================================================================
create index if not exists idx_ai_messages_conv on public.ai_messages(conversation_id);
