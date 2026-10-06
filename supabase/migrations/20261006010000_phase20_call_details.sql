-- Phase 20: what the voice provider reports about each call beyond the transcript (2026-10-06).
--
-- One jsonb, read through sanitizeCallDetails in src/lib/voice/call-details.ts: why the call
-- ended, web or phone, from and to, the agent's average response time, and turn and
-- interruption counts. The recording itself stays with the provider and is streamed on demand.

alter table public.call_attempts add column if not exists call_details jsonb;
