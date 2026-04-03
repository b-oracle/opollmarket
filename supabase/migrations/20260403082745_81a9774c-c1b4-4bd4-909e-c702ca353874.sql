
-- 1. PROFILES: Drop and recreate public_profiles view
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
SELECT 
  id, display_name, avatar_url, bio, is_public, verification_level,
  twitter_username, twitter_avatar_url, created_at, wallet_address, kyc_status,
  interests, location, gender, age, social_tutorial_seen
FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 2. COMMISSION_SETTINGS: Safe view for client reads
CREATE OR REPLACE VIEW public.public_commission_settings AS
SELECT
  prediction_fee_percent, creator_fee_percent, creator_fee_blue_percent,
  creator_fee_gold_percent, referrer_commission_percent, exit_fee_percent,
  quick_trade_fee_percent, qt_min_bet, qt_max_bet, qt_streak_2x, qt_streak_3x,
  qt_streak_4x, qt_streak_5x, qt_enabled_assets, qt_enabled_timeframes,
  qt_disabled_assets, auto_resolve_fee, boost_flash_price, boost_standard_price,
  boost_whale_price, broadcast_price, bc400_pool_percent, osure_enabled,
  osure_25_premium, osure_50_premium, osure_100_premium, social_ad_price,
  ai_generation_cost, welcome_bonus_percent, welcome_bonus_cap, min_liquidity,
  min_token_balance, min_gold_token_balance, min_nft_balance, referral_reward_amount,
  payout_provider, withdrawal_cooldown_minutes, withdrawal_multiplier,
  withdrawal_limit_enabled, min_withdrawal_amount, market_creation_fee,
  deposit_provider
FROM public.commission_settings
LIMIT 1;
GRANT SELECT ON public.public_commission_settings TO anon, authenticated;

-- Restrict raw table to admins only
DROP POLICY IF EXISTS "Authenticated can read commission settings" ON public.commission_settings;
CREATE POLICY "Only admins can read commission settings"
ON public.commission_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- 3. SECURITY SETTINGS: Remove admin blanket read of secrets
DROP POLICY IF EXISTS "Admins can read all security settings" ON public.user_security_settings;
CREATE OR REPLACE VIEW public.admin_security_overview AS
SELECT 
  user_id, pin_enabled, totp_enabled, require_pin_withdrawal,
  require_totp_withdrawal, require_pin_login, require_totp_login,
  security_setup_complete, last_verified_at, created_at, updated_at
FROM public.user_security_settings;
GRANT SELECT ON public.admin_security_overview TO authenticated;

-- 4. TRANSACTIONS: Remove policy exposing user_id in public trades
DROP POLICY IF EXISTS "Authenticated can read confirmed market trades" ON public.transactions;
CREATE OR REPLACE VIEW public.public_market_trades AS
SELECT 
  id, type, amount, market_id, option_id, side, shares, price, status, created_at
FROM public.transactions
WHERE type IN ('buy', 'sell') AND status = 'confirmed';
GRANT SELECT ON public.public_market_trades TO anon, authenticated;
