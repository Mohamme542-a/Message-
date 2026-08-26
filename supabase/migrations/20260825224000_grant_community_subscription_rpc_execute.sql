-- Ensure authenticated clients can invoke the SECURITY DEFINER RPCs used by the app.
-- The functions still enforce admin/member authorization internally.
GRANT EXECUTE ON FUNCTION public.create_group(text, public.group_kind, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group_by_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_subscription_code(text, integer, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_subscription_code(text) TO authenticated;

-- Permit only the creator's own initial owner-membership row after a group is inserted.
-- All subsequent roster changes still require owner/admin authorization.
DROP POLICY IF EXISTS "owner or admin manages roster" ON public.group_members;
CREATE POLICY "owner or admin manages roster" ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (
    (member_id = auth.uid() AND role = 'owner' AND EXISTS (
      SELECT 1 FROM public.groups WHERE id = group_id AND owner_id = auth.uid()
    ))
    OR public.can_manage_group(group_id, auth.uid())
  );
