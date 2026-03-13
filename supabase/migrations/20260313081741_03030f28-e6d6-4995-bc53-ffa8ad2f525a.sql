
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_provider text;

INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('fiat_deposit_payaza', 'Fiat Deposit (Payaza NGN)', true)
ON CONFLICT DO NOTHING;
