-- Phase 18: Sarvam is no longer the voice provider (2026-10-05); Cartesia replaces it.
--
-- ai_employees.sarvam_agent_id linked each client to the agent staff built in Sarvam's
-- console (its unique index goes with it). call_attempts.dropped_variables recorded the
-- values a Sarvam agent rejected. Neither has a meaning without Sarvam.

alter table public.ai_employees drop column if exists sarvam_agent_id;
alter table public.call_attempts drop column if exists dropped_variables;
