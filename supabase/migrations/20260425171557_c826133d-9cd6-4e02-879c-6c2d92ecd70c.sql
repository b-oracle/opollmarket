DO $$
DECLARE
  _user_id uuid := '823b20de-b58f-4589-8beb-f96eaf4bad20';
  _tx_id uuid := '34c3240b-7b6a-486f-b309-52f38c77509f';
  _amount numeric := 4.475;
  _prev_status text;
BEGIN
  SELECT status INTO _prev_status FROM public.transactions WHERE id = _tx_id;

  IF _prev_status = 'confirmed' THEN
    RAISE NOTICE 'Transaction already confirmed; aborting.';
    RETURN;
  END IF;

  PERFORM public.adjust_balance(_user_id, _amount, 0::numeric, 0::numeric);

  UPDATE public.transactions
  SET status = 'confirmed',
      amount = _amount,
      net_amount_usd = _amount,
      gross_amount_usd = _amount
  WHERE id = _tx_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    _user_id,
    'Deposit Confirmed ✅',
    'Your deposit of $' || to_char(_amount, 'FM999990.00') || ' has been manually confirmed.',
    'deposit'
  );

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    _user_id,
    'manual_deposit_confirm',
    'transaction',
    _tx_id,
    jsonb_build_object(
      'amount', _amount,
      'user_id', _user_id,
      'previous_status', _prev_status,
      'note', 'Credited via SQL migration after NOWPayments dashboard verification (payment 6168388778)'
    )
  );
END $$;