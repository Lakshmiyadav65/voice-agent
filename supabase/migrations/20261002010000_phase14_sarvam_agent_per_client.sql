-- Phase 14: Sarvam is the only voice provider, so phase 13's Dograh links go. Staff
-- train each client's agent in Sarvam's console and link it here when adding the
-- client; null keeps the shared default agent (SARVAM_AGENT_ID). Calls run the
-- agent's latest committed version, so no version number is stored. One agent
-- belongs to one AI employee, since its training is specific to that client.

alter table public.ai_employees
  add column if not exists sarvam_agent_id text,
  drop column if exists dograh_workflow_id,
  drop column if exists dograh_knowledge_uuid;

create unique index if not exists ai_employees_sarvam_agent_id_key
  on public.ai_employees (sarvam_agent_id)
  where sarvam_agent_id is not null;
