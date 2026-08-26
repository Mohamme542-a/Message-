-- Lovable/Supabase installs pgcrypto functions in the extensions schema.
-- Recreate the two code functions with an explicit schema reference so no search_path drift occurs.
CREATE OR REPLACE FUNCTION public.create_subscription_code(
  _code text,
  _duration_days integer,
  _max_redemptions integer DEFAULT 1,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  normalized text := upper(trim(_code));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF normalized !~ '^AB-[A-Z0-9]{8,32}$' THEN RAISE EXCEPTION 'INVALID_CODE_FORMAT'; END IF;
  IF _duration_days NOT BETWEEN 1 AND 366 OR _max_redemptions NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_LIMIT'; END IF;
  INSERT INTO public.subscription_codes (code_hash, duration_days, max_redemptions, created_by, expires_at)
  VALUES (encode(extensions.digest(normalized, 'sha256'), 'hex'), _duration_days, _max_redemptions, auth.uid(), _expires_at);
  RETURN jsonb_build_object('code', normalized, 'durationDays', _duration_days, 'maxRedemptions', _max_redemptions);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_subscription_code(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  normalized text := upper(trim(_code));
  subscription public.subscription_codes;
  start_at timestamptz;
  next_until timestamptz;
BEGIN
  SELECT * INTO subscription FROM public.subscription_codes
  WHERE code_hash = encode(extensions.digest(normalized, 'sha256'), 'hex')
  FOR UPDATE;
  IF NOT FOUND OR subscription.disabled OR subscription.redemption_count >= subscription.max_redemptions
    OR (subscription.expires_at IS NOT NULL AND subscription.expires_at <= now()) THEN RAISE EXCEPTION 'CODE_UNAVAILABLE'; END IF;
  SELECT GREATEST(COALESCE(premium_until, now()), now()) INTO start_at FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  next_until := start_at + make_interval(days => subscription.duration_days);
  UPDATE public.subscription_codes SET redemption_count = redemption_count + 1 WHERE id = subscription.id;
  UPDATE public.profiles SET premium_until = next_until WHERE id = auth.uid();
  RETURN jsonb_build_object('premiumUntil', next_until, 'durationDays', subscription.duration_days);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_subscription_code(text, integer, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_subscription_code(text) TO authenticated;
