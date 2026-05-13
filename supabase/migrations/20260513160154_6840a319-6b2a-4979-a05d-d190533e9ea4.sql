-- Backfill referral rewards for existing referred users who never got rewarded
DO $$
DECLARE
  r RECORD;
  v_reward_amount numeric;
  v_normalized_email text;
  v_sybil_count bigint;
BEGIN
  SELECT referral_reward_amount INTO v_reward_amount FROM public.commission_settings LIMIT 1;
  IF v_reward_amount IS NULL OR v_reward_amount <= 0 THEN
    v_reward_amount := 5;
  END IF;

  FOR r IN
    SELECT p.id, p.referred_by, p.email, p.created_at
    FROM public.profiles p
    WHERE p.referred_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.referral_rewards rr
        WHERE rr.referrer_id = p.referred_by AND rr.referred_id = p.id
      )
    ORDER BY p.created_at ASC
  LOOP
    -- Sybil check
    v_normalized_email := public.normalize_email(r.email);
    v_sybil_count := 0;
    IF v_normalized_email IS NOT NULL THEN
      SELECT count(*) INTO v_sybil_count
      FROM public.referral_rewards rr
      JOIN public.profiles p2 ON p2.id = rr.referred_id
      WHERE rr.referrer_id = r.referred_by
        AND public.normalize_email(p2.email) = v_normalized_email;
    END IF;

    IF v_sybil_count > 0 THEN
      RAISE NOTICE 'Skipping sybil: % for referrer %', r.email, r.referred_by;
      CONTINUE;
    END IF;

    INSERT INTO public.referral_rewards (referrer_id, referred_id, amount, created_at)
    VALUES (r.referred_by, r.id, v_reward_amount, r.created_at);

    INSERT INTO public.balances (user_id, currency, bonus_balance)
    VALUES (r.referred_by, 'USDT', v_reward_amount)
    ON CONFLICT (user_id, currency)
    DO UPDATE SET bonus_balance = public.balances.bonus_balance + v_reward_amount,
                  updated_at = now();

    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      r.referred_by,
      'Referral Reward! 🎉',
      'You earned $' || v_reward_amount::text || ' bonus — your friend signed up!',
      'referral'
    );
  END LOOP;
END $$;