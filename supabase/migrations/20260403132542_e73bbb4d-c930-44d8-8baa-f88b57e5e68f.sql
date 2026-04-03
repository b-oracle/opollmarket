
-- Add gift_fee_percent column to commission_settings
ALTER TABLE public.commission_settings
ADD COLUMN IF NOT EXISTS gift_fee_percent numeric NOT NULL DEFAULT 2;

-- Recreate public_commission_settings view to include gift_fee_percent
DROP VIEW IF EXISTS public.public_commission_settings;
CREATE VIEW public.public_commission_settings AS
SELECT
  prediction_fee_percent,
  creator_fee_percent,
  creator_fee_blue_percent,
  creator_fee_gold_percent,
  referrer_commission_percent,
  exit_fee_percent,
  quick_trade_fee_percent,
  qt_min_bet,
  qt_max_bet,
  qt_streak_2x,
  qt_streak_3x,
  qt_streak_4x,
  qt_streak_5x,
  auto_resolve_fee,
  boost_flash_price,
  boost_standard_price,
  boost_whale_price,
  broadcast_price,
  bc400_pool_percent,
  osure_enabled,
  osure_25_premium,
  osure_50_premium,
  osure_100_premium,
  social_ad_price,
  ai_generation_cost,
  welcome_bonus_percent,
  welcome_bonus_cap,
  min_liquidity,
  min_token_balance,
  min_gold_token_balance,
  min_nft_balance,
  referral_reward_amount,
  withdrawal_cooldown_minutes,
  withdrawal_multiplier,
  withdrawal_limit_enabled,
  min_withdrawal_amount,
  market_creation_fee,
  token_decimals,
  blue_max_free_markets,
  gold_max_free_markets,
  qt_enabled_assets,
  qt_enabled_timeframes,
  qt_disabled_assets,
  payout_provider,
  deposit_provider,
  token_contract_address,
  nft_contract_address,
  nft_buy_url,
  gift_fee_percent
FROM public.commission_settings
LIMIT 1;

GRANT SELECT ON public.public_commission_settings TO anon, authenticated;

-- Update send_space_gift to deduct fee
CREATE OR REPLACE FUNCTION public.send_space_gift(
  _sender_id uuid,
  _recipient_id uuid,
  _space_id uuid,
  _emoji text,
  _amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cur_gift numeric;
  _fee_percent numeric;
  _fee numeric;
  _net numeric;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  IF _sender_id = _recipient_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot gift yourself');
  END IF;

  -- Get fee percent
  SELECT COALESCE(gift_fee_percent, 2) INTO _fee_percent
  FROM public.commission_settings LIMIT 1;

  _fee := ROUND((_amount * _fee_percent / 100)::numeric, 4);
  _net := _amount - _fee;

  -- Lock sender balance
  SELECT gift_balance INTO _cur_gift
  FROM public.balances
  WHERE user_id = _sender_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND OR _cur_gift < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient gift balance');
  END IF;

  -- Deduct full amount from sender gift_balance
  UPDATE public.balances
  SET gift_balance = gift_balance - _amount, updated_at = now()
  WHERE user_id = _sender_id AND currency = 'USDT';

  -- Credit recipient rewards_balance with net amount (after fee)
  UPDATE public.balances
  SET rewards_balance = rewards_balance + _net, updated_at = now()
  WHERE user_id = _recipient_id AND currency = 'USDT';

  -- If recipient has no balance row, create one
  IF NOT FOUND THEN
    INSERT INTO public.balances (user_id, amount, rewards_balance, currency)
    VALUES (_recipient_id, 0, _net, 'USDT');
  END IF;

  -- Log gift (logged at full amount for sender record)
  INSERT INTO public.space_gifts (sender_id, recipient_id, space_id, emoji, amount)
  VALUES (_sender_id, _recipient_id, _space_id, _emoji, _amount);

  RETURN jsonb_build_object(
    'success', true,
    'remaining_gift_balance', _cur_gift - _amount,
    'fee', _fee,
    'net_amount', _net
  );
END;
$$;

-- Update send_dm_gift to deduct fee
CREATE OR REPLACE FUNCTION public.send_dm_gift(
  p_conversation_id uuid,
  p_recipient_id uuid,
  p_amount numeric,
  p_emoji text DEFAULT '🎁'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
  v_sender_balance numeric;
  v_msg_id uuid;
  v_fee_percent numeric;
  v_fee numeric;
  v_net numeric;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_sender_id = p_recipient_id THEN RAISE EXCEPTION 'Cannot gift yourself'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  -- Get fee percent
  SELECT COALESCE(gift_fee_percent, 2) INTO v_fee_percent
  FROM commission_settings LIMIT 1;

  v_fee := ROUND((p_amount * v_fee_percent / 100)::numeric, 4);
  v_net := p_amount - v_fee;

  -- Verify conversation membership
  IF NOT EXISTS (
    SELECT 1 FROM dm_conversations
    WHERE id = p_conversation_id
    AND (user_a = v_sender_id OR user_b = v_sender_id)
    AND (user_a = p_recipient_id OR user_b = p_recipient_id)
  ) THEN
    RAISE EXCEPTION 'Invalid conversation';
  END IF;

  -- Lock and check sender gift_balance
  SELECT gift_balance INTO v_sender_balance
  FROM balances WHERE user_id = v_sender_id FOR UPDATE;

  IF v_sender_balance IS NULL OR v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient gift balance';
  END IF;

  -- Deduct full amount from sender
  UPDATE balances SET gift_balance = gift_balance - p_amount, updated_at = now()
  WHERE user_id = v_sender_id;

  -- Credit recipient rewards_balance with net amount
  UPDATE balances SET rewards_balance = rewards_balance + v_net, updated_at = now()
  WHERE user_id = p_recipient_id;

  -- Insert gift message
  INSERT INTO dm_messages (conversation_id, sender_id, content, gift_amount)
  VALUES (p_conversation_id, v_sender_id, p_emoji, p_amount)
  RETURNING id INTO v_msg_id;

  -- Update last_message_at
  UPDATE dm_conversations SET last_message_at = now() WHERE id = p_conversation_id;

  RETURN v_msg_id;
END;
$$;
