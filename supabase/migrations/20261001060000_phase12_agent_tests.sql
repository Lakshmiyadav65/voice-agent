-- Phase 12: owner-written test cases for each agent, with the last run's
-- transcript and verdict. They run against our own simulation of the agent, so
-- they work whichever voice provider is connected.

alter table public.ai_employees
  -- [{ "id", "name", "scenario", "expected", "lastRun": { "passed", "reason", "transcript", "ranAt" } }]
  add column if not exists agent_tests jsonb not null default '[]'::jsonb;
