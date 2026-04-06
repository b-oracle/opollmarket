CREATE POLICY "Users can delete own tickets" ON public.support_tickets FOR DELETE USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'support'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Cascade delete support messages" ON public.support_messages FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets st
    WHERE st.id = ticket_id
    AND (
      st.user_id = auth.uid()
      OR has_role(auth.uid(), 'support'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
);