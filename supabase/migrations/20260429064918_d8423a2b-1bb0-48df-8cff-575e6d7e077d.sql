-- Remove the two transactions the cron incorrectly back-fired this morning.
DELETE FROM public.transactions
WHERE id IN (
  'b8a1594f-6d42-4c77-8410-6449597d4383', -- iD Mobile (actually due 9 May)
  'b600b211-b665-4561-a2bb-cf4fb2c7b0ef'  -- DLA - Ollie (already paid 28 Apr, next 26 May)
);