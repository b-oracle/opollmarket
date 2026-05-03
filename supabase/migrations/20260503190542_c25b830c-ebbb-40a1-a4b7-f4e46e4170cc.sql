
-- Idempotency claim table for transactional notification emails.
-- Prevents duplicate enqueues when cron jobs re-run, edge functions retry,
-- or webhooks are redelivered.
create table if not exists public.notification_email_claims (
  idempotency_key text primary key,
  template_name text not null,
  user_id uuid,
  created_at timestamptz not null default now()
);

alter table public.notification_email_claims enable row level security;

-- No policies = no client access. Service role bypasses RLS.

create index if not exists notification_email_claims_created_at_idx
  on public.notification_email_claims (created_at);

-- Atomic claim: returns true only the first time a key is seen.
create or replace function public.claim_notification_email(
  _idempotency_key text,
  _template_name text,
  _user_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  insert into public.notification_email_claims (idempotency_key, template_name, user_id)
  values (_idempotency_key, _template_name, _user_id)
  on conflict (idempotency_key) do nothing
  returning true into inserted;

  return coalesce(inserted, false);
end;
$$;

revoke all on function public.claim_notification_email(text, text, uuid) from public;
grant execute on function public.claim_notification_email(text, text, uuid) to service_role;

-- Daily cleanup of claims older than 30 days (safe — idempotency keys for
-- market events are unique per event and won't recur after this window).
select cron.schedule(
  'cleanup-notification-email-claims',
  '0 4 * * *',
  $cleanup$
  delete from public.notification_email_claims where created_at < now() - interval '30 days';
  $cleanup$
);
