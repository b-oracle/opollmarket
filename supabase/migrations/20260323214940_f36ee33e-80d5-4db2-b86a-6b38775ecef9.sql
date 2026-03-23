
CREATE POLICY "Anyone can count page views"
ON public.analytics_events
FOR SELECT
TO authenticated
USING (event_name = 'page_view');
