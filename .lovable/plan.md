

## Plan: Throttle External API Cron Jobs

### Current state (expensive jobs)

| Job | Current | External API | Calls/day |
|---|---|---|---|
| `check-sports-scores` | Every 2 min | API-Sports | ~720 |
| `check-sports-resolve-markets` | Every 5 min | API-Sports | ~288 |
| `check-auto-resolve-markets` | Every 5 min | Twitter + Price APIs | ~288 |
| `check-poly-resolve-every-5min` | Every 5 min | Polymarket | ~288 |
| `import-polymarkets-every-30min` | Every 30 min | Polymarket | ~48 |

### New schedules

| Job | New Schedule | Calls/day | Savings |
|---|---|---|---|
| `check-sports-scores` | Every 30 min | 48 | **93% reduction** |
| `check-sports-resolve-markets` | Twice daily (8AM, 8PM UTC) | 2 | **99% reduction** |
| `check-auto-resolve-markets` | Twice daily (7AM, 7PM UTC) | 2 | **99% reduction** |
| `check-poly-resolve-every-5min` | Twice daily (9AM, 9PM UTC) | 2 | **99% reduction** |
| `import-polymarkets-every-30min` | Keep as-is (free API) | 48 | -- |

### Implementation

Run SQL via insert tool (not migration) to update cron schedules:

```sql
SELECT cron.alter_job(5,  schedule := '*/30 * * * *');   -- sports scores
SELECT cron.alter_job(4,  schedule := '0 8,20 * * *');   -- sports resolve
SELECT cron.alter_job(3,  schedule := '0 7,19 * * *');   -- auto resolve (Twitter + price)
SELECT cron.alter_job(8,  schedule := '0 9,21 * * *');   -- poly resolve
```

### Trade-offs

- Live score badges on market pages will update every 30 min instead of every 2 min
- Twitter engagement trackers will only refresh twice daily
- Auto-resolution of markets will happen at fixed times rather than near-instantly
- Polymarket import frequency stays the same (free API, no cost concern)

### Files modified

None -- this is a database-only change (cron job schedule updates).

