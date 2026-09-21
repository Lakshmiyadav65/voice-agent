-- Phase 5: Per-call analysis so agent quality can be measured and improved.
-- Derived from the transcript after the call, alongside the existing summary.

alter table public.call_attempts
  add column if not exists outcome text
    check (outcome in ('interested', 'not_interested', 'callback_requested', 'wrong_number', 'no_answer', 'unclear')),
  add column if not exists sentiment text
    check (sentiment in ('positive', 'neutral', 'negative')),
  -- Questions the caller asked that the agent could not answer: the direct
  -- signal for what knowledge the business still needs to supply.
  add column if not exists unanswered_questions jsonb not null default '[]'::jsonb,
  add column if not exists topics jsonb not null default '[]'::jsonb;

create index if not exists call_attempts_outcome_idx on public.call_attempts (outcome);
create index if not exists call_attempts_created_at_idx on public.call_attempts (created_at desc);
