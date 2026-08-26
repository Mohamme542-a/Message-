-- Allow the one-time creator membership used only when the RPC fallback is needed.
-- The existing manager policy requires membership first, which makes a direct fallback
-- impossible even when the creator already owns the newly inserted group.
DROP POLICY IF EXISTS "owner or admin manages roster" ON public.group_members;

CREATE POLICY "owner or admin manages roster" ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_group(group_id, auth.uid())
    OR (
      member_id = auth.uid()
      AND role = 'owner'
      AND EXISTS (
        SELECT 1 FROM public.groups
        WHERE id = group_id AND owner_id = auth.uid()
      )
    )
  );
