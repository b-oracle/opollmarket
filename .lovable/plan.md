

# Update Twitter Resource ID for Instablog9ja Market

## What needs to happen
The market "Instablog9ja X/Twitter impressions count by November 2026?" (ID: `3f2baea2-7704-4cdf-acda-130660470837`) currently has `twitter_resource_id` set to `null`. It needs to be updated to `instablog9ja` so the auto-resolve system can track the view count.

## Change
Single data update on the `markets` table:
```sql
UPDATE markets 
SET twitter_resource_id = 'instablog9ja' 
WHERE id = '3f2baea2-7704-4cdf-acda-130660470837';
```

This will enable the `fetch-twitter-metrics` edge function to start polling @instablog9ja's impressions for auto-resolution.

## No code changes needed
This is purely a database data fix.

