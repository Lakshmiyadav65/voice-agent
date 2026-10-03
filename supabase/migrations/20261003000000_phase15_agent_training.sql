-- Phase 15: what staff trained in the voice provider's console (Sarvam today), kept
-- on the platform so the client and staff can read it. Sarvam's API cannot read an
-- agent's prompt or voice back, so staff record it here after each change. Only
-- staff write it: the existing "Staff manage ai employees" policy already covers
-- the column, and members keep their read-only access. Null means nothing recorded.

alter table public.ai_employees
  add column if not exists agent_training jsonb;
