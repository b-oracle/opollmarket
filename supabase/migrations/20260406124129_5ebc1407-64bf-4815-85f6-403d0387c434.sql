DROP POLICY "Users can delete own tickets" ON public.support_tickets;
DROP POLICY "Cascade delete support messages" ON public.support_messages;

CREATE POLICY "Super admins can delete tickets" ON public.support_tickets FOR DELETE USING (
  has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Super admins can delete support messages" ON public.support_messages FOR DELETE USING (
  has_role(auth.uid(), 'super_admin'::app_role)
);