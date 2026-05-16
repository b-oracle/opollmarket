CREATE UNIQUE INDEX IF NOT EXISTS uniq_registration_bonus_per_user
ON public.transactions (user_id)
WHERE type = 'registration_bonus';