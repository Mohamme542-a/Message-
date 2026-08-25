ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS recovery_backup text;
