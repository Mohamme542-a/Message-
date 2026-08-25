-- Alpha Byte: professional communities, verified profiles and admin-issued subscription codes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_until timestamptz;

DO $$ BEGIN
  CREATE TYPE public.group_kind AS ENUM ('group', 'channel');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.group_member_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  kind public.group_kind NOT NULL DEFAULT 'group',
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 70),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 512),
  avatar_url text,
  invite_slug text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(9), 'hex'),
  slow_mode_seconds integer NOT NULL DEFAULT 0 CHECK (slow_mode_seconds IN (0, 10, 30, 60, 300)),
  members_can_invite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.group_member_role NOT NULL DEFAULT 'member',
  muted_until timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.group_key_envelopes (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key_version integer NOT NULL DEFAULT 1,
  encrypted_key text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, member_id, key_version)
);

CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  encrypted_payload text NOT NULL,
  iv text NOT NULL,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'image', 'audio', 'video', 'file')),
  reply_to uuid REFERENCES public.group_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_messages_group_created_idx ON public.group_messages(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.subscription_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 366),
  max_redemptions integer NOT NULL DEFAULT 1 CHECK (max_redemptions BETWEEN 1 AND 10000),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  expires_at timestamptz,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_codes_active_idx
  ON public.subscription_codes(expires_at) WHERE disabled = false;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND member_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.group_role(_group_id uuid, _user_id uuid)
RETURNS public.group_member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.group_members
  WHERE group_id = _group_id AND member_id = _user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_group(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.group_role(_group_id, _user_id) IN ('owner', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.can_send_group_message(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_group_member(_group_id, _user_id)
    AND (
      (SELECT kind FROM public.groups WHERE id = _group_id) = 'group'
      OR public.group_role(_group_id, _user_id) IN ('owner', 'admin')
    );
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups, public.group_members, public.group_key_envelopes, public.group_messages TO authenticated;
GRANT SELECT ON public.subscription_codes TO authenticated;
GRANT ALL ON public.groups, public.group_members, public.group_key_envelopes, public.group_messages, public.subscription_codes TO service_role;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_key_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group members read groups" ON public.groups FOR SELECT TO authenticated
  USING (public.is_group_member(id, auth.uid()));
CREATE POLICY "creator starts group" ON public.groups FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "group owners update group" ON public.groups FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "members read group roster" ON public.group_members FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "owner or admin manages roster" ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_group(group_id, auth.uid()));
CREATE POLICY "owners update roster" ON public.group_members FOR UPDATE TO authenticated
  USING (public.group_role(group_id, auth.uid()) = 'owner') WITH CHECK (public.group_role(group_id, auth.uid()) = 'owner');
CREATE POLICY "owners remove member" ON public.group_members FOR DELETE TO authenticated
  USING (public.group_role(group_id, auth.uid()) = 'owner');
CREATE POLICY "members leave group" ON public.group_members FOR DELETE TO authenticated
  USING (member_id = auth.uid());

CREATE POLICY "member reads own group key envelope" ON public.group_key_envelopes FOR SELECT TO authenticated
  USING (member_id = auth.uid());
CREATE POLICY "manager distributes group keys" ON public.group_key_envelopes FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_group(group_id, auth.uid()) AND sender_id = auth.uid());

CREATE POLICY "members read group messages" ON public.group_messages FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "authorized members send group messages" ON public.group_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.can_send_group_message(group_id, auth.uid()));
CREATE POLICY "sender deletes group message" ON public.group_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

CREATE POLICY "admins read subscription codes" ON public.subscription_codes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.create_group(
  _title text,
  _kind public.group_kind DEFAULT 'group',
  _description text DEFAULT '',
  _avatar_url text DEFAULT NULL
)
RETURNS public.groups LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  created_group public.groups;
BEGIN
  IF char_length(trim(_title)) NOT BETWEEN 1 AND 70 OR char_length(_description) > 512 THEN
    RAISE EXCEPTION 'INVALID_GROUP_DETAILS';
  END IF;
  INSERT INTO public.groups (owner_id, kind, title, description, avatar_url)
  VALUES (auth.uid(), _kind, trim(_title), trim(_description), _avatar_url)
  RETURNING * INTO created_group;
  INSERT INTO public.group_members (group_id, member_id, role)
  VALUES (created_group.id, auth.uid(), 'owner');
  RETURN created_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_group_by_invite(_invite_slug text)
RETURNS public.groups LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_group public.groups;
BEGIN
  SELECT * INTO target_group FROM public.groups WHERE invite_slug = trim(_invite_slug) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;
  INSERT INTO public.group_members (group_id, member_id, role)
  VALUES (target_group.id, auth.uid(), 'member')
  ON CONFLICT (group_id, member_id) DO NOTHING;
  RETURN target_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_group_member_role(
  _group_id uuid,
  _member_id uuid,
  _role public.group_member_role
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.group_role(_group_id, auth.uid()) <> 'owner' THEN
    RAISE EXCEPTION 'OWNER_REQUIRED';
  END IF;
  IF _role = 'owner' OR _member_id = auth.uid() THEN
    RAISE EXCEPTION 'ROLE_CHANGE_NOT_ALLOWED';
  END IF;
  UPDATE public.group_members SET role = _role WHERE group_id = _group_id AND member_id = _member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_member(_group_id uuid, _member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_role public.group_member_role; target_role public.group_member_role;
BEGIN
  actor_role := public.group_role(_group_id, auth.uid());
  target_role := public.group_role(_group_id, _member_id);
  IF actor_role NOT IN ('owner', 'admin') OR _member_id = auth.uid() THEN
    RAISE EXCEPTION 'REMOVAL_NOT_ALLOWED';
  END IF;
  IF target_role = 'owner' OR (actor_role = 'admin' AND target_role = 'admin') THEN
    RAISE EXCEPTION 'REMOVAL_NOT_ALLOWED';
  END IF;
  DELETE FROM public.group_members WHERE group_id = _group_id AND member_id = _member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_subscription_code(
  _code text,
  _duration_days integer,
  _max_redemptions integer DEFAULT 1,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  normalized text := upper(trim(_code));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;
  IF normalized !~ '^AB-[A-Z0-9]{8,32}$' THEN
    RAISE EXCEPTION 'INVALID_CODE_FORMAT';
  END IF;
  IF _duration_days NOT BETWEEN 1 AND 366 OR _max_redemptions NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'INVALID_SUBSCRIPTION_LIMIT';
  END IF;
  INSERT INTO public.subscription_codes (code_hash, duration_days, max_redemptions, created_by, expires_at)
  VALUES (encode(digest(normalized, 'sha256'), 'hex'), _duration_days, _max_redemptions, auth.uid(), _expires_at);
  RETURN jsonb_build_object('code', normalized, 'durationDays', _duration_days, 'maxRedemptions', _max_redemptions);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_subscription_code(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  normalized text := upper(trim(_code));
  subscription public.subscription_codes;
  start_at timestamptz;
  next_until timestamptz;
BEGIN
  SELECT * INTO subscription FROM public.subscription_codes
  WHERE code_hash = encode(digest(normalized, 'sha256'), 'hex')
  FOR UPDATE;
  IF NOT FOUND OR subscription.disabled OR subscription.redemption_count >= subscription.max_redemptions
    OR (subscription.expires_at IS NOT NULL AND subscription.expires_at <= now()) THEN
    RAISE EXCEPTION 'CODE_UNAVAILABLE';
  END IF;
  SELECT GREATEST(COALESCE(premium_until, now()), now()) INTO start_at FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  next_until := start_at + make_interval(days => subscription.duration_days);
  UPDATE public.subscription_codes SET redemption_count = redemption_count + 1 WHERE id = subscription.id;
  UPDATE public.profiles SET premium_until = next_until WHERE id = auth.uid();
  RETURN jsonb_build_object('premiumUntil', next_until, 'durationDays', subscription.duration_days);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_subscription_code(text, integer, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_subscription_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group(text, public.group_kind, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group_by_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_member_role(uuid, uuid, public.group_member_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "public reads profile avatars" ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-avatars');
CREATE POLICY "users upload own profile avatars" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users update own profile avatars" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users delete own profile avatars" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profile-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
