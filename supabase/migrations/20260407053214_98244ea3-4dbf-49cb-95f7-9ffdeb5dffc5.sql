
-- 1. Fix market_broadcasts: restrict SELECT from public to authenticated
DROP POLICY IF EXISTS "Broadcasts publicly readable" ON public.market_broadcasts;
CREATE POLICY "Broadcasts readable by authenticated" ON public.market_broadcasts
  FOR SELECT TO authenticated USING (true);

-- 2. Fix market_boosts: restrict SELECT from public to authenticated
DROP POLICY IF EXISTS "Boosts are publicly readable" ON public.market_boosts;
CREATE POLICY "Boosts readable by authenticated" ON public.market_boosts
  FOR SELECT TO authenticated USING (true);

-- 3. Fix all views to be SECURITY INVOKER instead of SECURITY DEFINER
-- public_profiles
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true)
AS SELECT id, display_name, avatar_url, bio, is_public, verification_level,
  wallet_address, twitter_username, twitter_avatar_url, interests, location,
  created_at, kyc_status, social_tutorial_seen, unlimited_markets, updated_at
FROM profiles;

-- public_commission_settings
CREATE OR REPLACE VIEW public.public_commission_settings
WITH (security_invoker = true)
AS SELECT prediction_fee_percent, creator_fee_percent, creator_fee_blue_percent,
  creator_fee_gold_percent, referrer_commission_percent, exit_fee_percent,
  quick_trade_fee_percent, qt_min_bet, qt_max_bet, qt_streak_2x, qt_streak_3x,
  qt_streak_4x, qt_streak_5x, auto_resolve_fee, boost_flash_price, boost_standard_price,
  boost_whale_price, broadcast_price, bc400_pool_percent, osure_enabled, osure_25_premium,
  osure_50_premium, osure_100_premium, social_ad_price, ai_generation_cost,
  welcome_bonus_percent, welcome_bonus_cap, min_liquidity, min_token_balance,
  min_gold_token_balance, min_nft_balance, referral_reward_amount,
  withdrawal_cooldown_minutes, withdrawal_multiplier, withdrawal_limit_enabled,
  min_withdrawal_amount, market_creation_fee, token_decimals, blue_max_free_markets,
  gold_max_free_markets, qt_enabled_assets, qt_enabled_timeframes, qt_disabled_assets,
  payout_provider, deposit_provider, token_contract_address, nft_contract_address,
  nft_buy_url, gift_fee_percent, prediction_min_bet, prediction_max_bet,
  deposit_min_amount, deposit_max_amount, push_prompt_cooldown_days,
  deposit_expiry_minutes, max_drafts_none, max_drafts_blue, max_drafts_gold
FROM commission_settings LIMIT 1;

-- public_market_trades
CREATE OR REPLACE VIEW public.public_market_trades
WITH (security_invoker = true)
AS SELECT id, type, amount, market_id, option_id, side, shares, price, status, created_at
FROM transactions
WHERE type IN ('buy', 'sell') AND status = 'confirmed';

-- public_orderbook
CREATE OR REPLACE VIEW public.public_orderbook
WITH (security_invoker = true)
AS SELECT id, market_id, option_id, side, order_type, limit_price, amount, shares, status, created_at
FROM limit_orders
WHERE status = 'pending';

-- admin_security_overview
CREATE OR REPLACE VIEW public.admin_security_overview
WITH (security_invoker = true)
AS SELECT user_id, pin_enabled, totp_enabled, require_pin_withdrawal, require_totp_withdrawal,
  require_pin_login, require_totp_login, security_setup_complete, last_verified_at,
  created_at, updated_at
FROM user_security_settings;
