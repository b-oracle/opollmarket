CREATE OR REPLACE FUNCTION public.claim_market_for_resolution(_market_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status text;
  _resolved_side text;
  _winning_option_id uuid;
BEGIN
  SELECT status, resolved_side, winning_option_id
  INTO _status, _resolved_side, _winning_option_id
  FROM public.markets
  WHERE id = _market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market not found');
  END IF;

  IF _status = 'resolved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market already resolved');
  END IF;

  IF _status = 'resolving' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market settlement already in progress');
  END IF;

  IF _resolved_side IS NOT NULL OR _winning_option_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market has prior resolution data');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE market_id = _market_id
      AND type IN ('payout', 'refund', 'one_sided_refund')
      AND status = 'confirmed'
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market already has confirmed settlement transactions');
  END IF;

  UPDATE public.markets
  SET status = 'resolving', updated_at = now()
  WHERE id = _market_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

DO $$
DECLARE
  _actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  _golden uuid := '5b688702-de7f-40aa-8701-17cc68655fac'::uuid;
  _whats uuid := 'acaded1b-7ecf-4191-9ad3-8293ef5954bb'::uuid;
  _arsenal_market uuid := 'e6ac29b7-73ce-44dd-b108-69b686eff821'::uuid;
  _ngannou_market uuid := 'd974ccf3-0090-4d49-8200-ce16c8ef6b81'::uuid;
  _golden_credit numeric := 4.16;
  _whats_credit numeric := 18.00;
BEGIN
  SELECT user_id INTO _actor
  FROM public.user_roles
  WHERE role IN ('super_admin', 'admin')
  LIMIT 1;
  _actor := COALESCE(_actor, '00000000-0000-0000-0000-000000000000'::uuid);

  IF NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE user_id = _golden
      AND market_id = _arsenal_market
      AND description = 'Make-good credit: Arsenal settlement display shortfall'
  ) THEN
    PERFORM public.adjust_balance(_golden, _golden_credit, 0, 0);
    INSERT INTO public.transactions (user_id, market_id, type, amount, status, description, side)
    VALUES (_golden, _arsenal_market, 'adjustment', _golden_credit, 'confirmed', 'Make-good credit: Arsenal settlement display shortfall', 'make_good');
    INSERT INTO public.audit_logs (actor_id, action, target_id, target_type, details)
    VALUES (_actor, 'customer_make_good_credit', _golden, 'user', jsonb_build_object(
      'market_id', _arsenal_market,
      'reason', 'Arsenal parimutuel UI displayed the max return cap as an expected payout; credited the difference between cap and amount received.',
      'amount', _golden_credit
    ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE user_id = _whats
      AND market_id = _ngannou_market
      AND description = 'Make-good credit: missing Ngannou winning payout'
  ) THEN
    PERFORM public.adjust_balance(_whats, _whats_credit, 0, 0);
    INSERT INTO public.transactions (user_id, market_id, type, amount, status, description, side, shares, price)
    VALUES (_whats, _ngannou_market, 'payout', _whats_credit, 'confirmed', 'Make-good credit: missing Ngannou winning payout', 'yes', 18, 1);
    INSERT INTO public.audit_logs (actor_id, action, target_id, target_type, details)
    VALUES (_actor, 'customer_make_good_credit', _whats, 'user', jsonb_build_object(
      'market_id', _ngannou_market,
      'reason', 'Sports auto-resolution marked the market resolved but did not record the winning payout; credited missing payout.',
      'amount', _whats_credit,
      'liquidity_return_already_paid', 22.50
    ));
  END IF;
END;
$$;