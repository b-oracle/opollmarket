
create table if not exists public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  template_name text not null,
  user_id uuid,
  recipient_email text,
  template_data jsonb not null default '{}'::jsonb,
  pref_key text,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','dlq','skipped')),
  attempts int not null default 0,
  max_attempts int not null default 6,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_email_outbox enable row level security;

create index if not exists notification_email_outbox_due_idx
  on public.notification_email_outbox (status, next_attempt_at)
  where status in ('pending','processing');

create index if not exists notification_email_outbox_dlq_idx
  on public.notification_email_outbox (status, updated_at desc)
  where status = 'dlq';

create or replace function public.touch_notification_email_outbox()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_notification_email_outbox on public.notification_email_outbox;
create trigger trg_touch_notification_email_outbox
  before update on public.notification_email_outbox
  for each row execute function public.touch_notification_email_outbox();

create or replace function public.claim_notification_email_outbox(_limit int default 25)
returns setof public.notification_email_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id from public.notification_email_outbox
    where status in ('pending','processing')
      and next_attempt_at <= now()
    order by next_attempt_at asc
    limit _limit
    for update skip locked
  )
  update public.notification_email_outbox o
     set status = 'processing',
         locked_at = now(),
         attempts = o.attempts + 1
   from due
   where o.id = due.id
   returning o.*;
end;
$$;

revoke all on function public.claim_notification_email_outbox(int) from public;
grant execute on function public.claim_notification_email_outbox(int) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-notification-email-outbox') then
    perform cron.unschedule('cleanup-notification-email-outbox');
  end if;
end $$;

select cron.schedule(
  'cleanup-notification-email-outbox',
  '15 4 * * *',
  $cleanup$
  delete from public.notification_email_outbox
   where status in ('sent','skipped')
     and updated_at < now() - interval '30 days';
  $cleanup$
);
