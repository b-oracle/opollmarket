

## ✅ Social Ads Feature — Implemented

Paid promotion type that injects market advertisements into users' status feeds, styled like normal posts but tagged "Sponsored". Supports optional YouTube video ads with autoplay/loop.

### What was built
- **Database**: `social_ads` table with RLS + `social_ad_price` column on `commission_settings`
- **Edge function**: `pay-promotion-balance` extended to handle social ad creation
- **SocialAdCard**: New component rendering sponsored posts with market preview, YouTube embed, impression/click tracking
- **StatusFeed**: Injects active ads every 5 posts in the timeline
- **BoostMarketModal**: New "📺 Social Ad" option with headline + YouTube URL inputs
