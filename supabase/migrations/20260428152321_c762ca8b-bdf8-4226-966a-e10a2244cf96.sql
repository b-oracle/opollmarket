ALTER TABLE public.dm_call_events DROP CONSTRAINT IF EXISTS dm_call_events_event_type_check;
ALTER TABLE public.dm_call_events ADD CONSTRAINT dm_call_events_event_type_check
  CHECK (event_type IN ('received','accepted','declined','joined','ended','failed','missed','rejoin','timeout','cancelled','muted'));