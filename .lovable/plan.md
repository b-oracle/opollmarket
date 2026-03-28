

# Delete Polymarket-Imported Markets

## Action
Execute a single DELETE query to remove all polymarket-imported markets except the Kraken IPO market (which has 1 participant).

## SQL to Execute (via insert tool)
```sql
DELETE FROM markets
WHERE polymarket_id IS NOT NULL
  AND id != 'ad9de537-945b-437a-a679-dda8c5081322';
```

## Result
- ~138 empty markets removed
- Kraken IPO market preserved with its existing prediction

## Files Modified
None — data-only operation.

