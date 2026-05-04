ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS adults integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pets integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_budget_override numeric;