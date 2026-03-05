

## Plan: Set up a cron job to auto-expire stale deposits every 15 minutes

### What it does
A scheduled database job will call `expire_stale_pending_deposits()` every 15 minutes, automatically marking pending deposits and boosts older than 1 hour as `expired`.

### Technical approach

1. **Enable extensions**: Enable `pg_cron` and `pg_net` via a database migration.

2. **Create the cron job**: Use the insert tool (not migration, since it contains project-specific URLs and keys) to schedule a `pg_cron` job that calls the edge function or directly runs the SQL function every 15 minutes.

   Since the function is a simple database function (not an edge function), we can use `cron.schedule` to call it directly via SQL rather than going through an HTTP request:
   ```sql
   SELECT cron.schedule(
     'expire-stale-deposits',
     '*/15 * * * *',
     $$SELECT public.expire_stale_pending_deposits();$$
   );
   ```

3. **Migration for extensions**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   CREATE EXTENSION IF NOT EXISTS pg_net;
   ```

### Steps
1. Create a migration to enable `pg_cron` and `pg_net` extensions
2. Use the insert tool to schedule the cron job

No code changes needed -- this is purely database-level.

