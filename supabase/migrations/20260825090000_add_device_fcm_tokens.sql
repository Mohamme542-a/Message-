ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS fcm_token text;
CREATE INDEX IF NOT EXISTS devices_fcm_token_idx ON public.devices (fcm_token) WHERE fcm_token IS NOT NULL;
