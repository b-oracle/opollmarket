
ALTER TABLE public.profiles ADD COLUMN date_of_birth date;

-- Backfill: if age exists, estimate DOB (Jan 1 of birth year)
UPDATE public.profiles
SET date_of_birth = make_date(EXTRACT(YEAR FROM now())::int - age, 1, 1)
WHERE age IS NOT NULL AND age > 0;
