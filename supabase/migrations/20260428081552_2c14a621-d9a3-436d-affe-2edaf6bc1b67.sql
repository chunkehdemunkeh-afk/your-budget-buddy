REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.user_household_ids(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.user_household_ids(uuid) TO authenticated;