
-- 1) Tighten household_members INSERT: require a matching unaccepted invite
DROP POLICY IF EXISTS "members can join via invite acceptance" ON public.household_members;

CREATE POLICY "members can join via invite acceptance"
ON public.household_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.household_invites hi
    WHERE hi.household_id = household_members.household_id
      AND hi.accepted_at IS NULL
      AND lower(hi.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "creator can join own household"
ON public.household_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.households h
    WHERE h.id = household_members.household_id
      AND h.created_by = auth.uid()
  )
);

-- 2) Lock down SECURITY DEFINER helpers so callers can only ask about themselves
CREATE OR REPLACE FUNCTION public.is_household_member(_household_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = _household_id
      AND user_id = _user_id
      AND _user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.user_household_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT household_id FROM public.household_members
  WHERE user_id = _user_id AND _user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_household_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_household_ids(uuid) TO authenticated;

-- 3) Realtime: require authentication to subscribe to any channel
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users only" ON realtime.messages;
CREATE POLICY "Authenticated users only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

-- 4) Move pg_net out of public schema (drop + recreate in extensions schema)
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
