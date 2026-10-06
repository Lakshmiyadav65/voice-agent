-- Phase 21: callbacks at the time the customer asked for (2026-10-06).
--
-- When a call ends with the customer asking to be called at a set time, the analysis
-- stores that time here and the scheduler (/api/campaigns/tick) calls them then.
-- callback_status: scheduled -> calling -> done, or failed when the call could not be placed.

alter table public.leads
  add column if not exists callback_at timestamptz,
  add column if not exists callback_status text
    check (callback_status in ('scheduled', 'calling', 'done', 'failed'));

create index if not exists leads_callback_due_idx
  on public.leads (callback_at)
  where callback_status = 'scheduled';
