
-- Fix security definer views by recreating with security_invoker

-- 1. public_commission_settings
DROP VIEW IF EXISTS public.public_commission_settings;
CREATE VIEW public.public_commission_settings
WITH (security_invoker = on) AS
SELECT
  prediction_fee_percent, creator_fee_percent, creator_fee_blue_percent,
  creator_fee_gold_percent, referrer_commission_percent, exit_fee_percent,
  quick_trade_fee_percent, qt_min_bet, qt_max_bet, qt_streak_2x, qt_streak_3x,
  qt_streak_4x, qt_streak_5x, auto_resolve_fee, boost_flash_price,
  boost_standard_price, boost_whale_price, broadcast_price, bc400_pool_percent,
  osure_enabled, osure_25_premium, osure_50_premium, osure_100_premium,
  social_ad_price, ai_generation_cost, welcome_bonus_percent, welcome_bonus_cap,
  min_liquidity, min_token_balance, min_gold_token_balance, min_nft_balance,
  referral_reward_amount, withdrawal_cooldown_minutes, withdrawal_multiplier,
  withdrawal_limit_enabled, min_withdrawal_amount, market_creation_fee,
  token_decimals, blue_max_free_markets, gold_max_free_markets,
  qt_enabled_assets, qt_enabled_timeframes, qt_disabled_assets,
  payout_provider, deposit_provider, token_contract_address,
  nft_contract_address, nft_buy_url, gift_fee_percent
FROM commission_settings
LIMIT 1;

-- 2. public_market_trades
DROP VIEW IF EXISTS public.public_market_trades;
CREATE VIEW public.public_market_trades
WITH (security_invoker = on) AS
SELECT id, type, amount, market_id, option_id, side, shares, price, status, created_at
FROM transactions
WHERE type IN ('buy', 'sell') AND status = 'confirmed';

-- 3. public_profiles
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = on) AS
SELECT id, display_name, avatar_url, bio, is_public, verification_level,
  twitter_username, twitter_avatar_url, created_at, wallet_address,
  kyc_status, interests, location, gender, age, social_tutorial_seen
FROM profiles;

-- public_commission_settings needs public read access since commission_settings is admin-only
-- Grant SELECT on the view to anon and authenticated
GRANT SELECT ON public.public_commission_settings TO anon, authenticated;

-- public_market_trades needs public read for market transparency
GRANT SELECT ON public.public_market_trades TO anon, authenticated;

-- public_profiles needs authenticated read
GRANT SELECT ON public.public_profiles TO authenticated;
