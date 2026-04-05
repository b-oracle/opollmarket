
CREATE TABLE public.community_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_slug text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, community_slug)
);
ALTER TABLE public.community_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all memberships" ON public.community_memberships FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join communities" ON public.community_memberships FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can leave communities" ON public.community_memberships FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_slug text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  image_url text,
  reply_to_id uuid,
  reply_to_content text,
  reply_to_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read community messages" ON public.community_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can send community messages" ON public.community_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can create tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff can update tickets" ON public.support_tickets FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  image_url text,
  is_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see messages on own tickets or staff sees all" ON public.support_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))));
CREATE POLICY "Users can send support messages" ON public.support_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))));
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  allow_calls boolean NOT NULL DEFAULT true,
  allow_dms boolean NOT NULL DEFAULT true,
  private_account boolean NOT NULL DEFAULT false,
  show_online_status boolean NOT NULL DEFAULT true,
  show_portfolio boolean NOT NULL DEFAULT true,
  show_trade_history boolean NOT NULL DEFAULT true,
  mute_notifications boolean NOT NULL DEFAULT false,
  allow_copy_trading boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own settings" ON public.user_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE TO authenticated USING (user_id = auth.uid());
