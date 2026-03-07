
CREATE OR REPLACE FUNCTION public.notify_moderator_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire when moderator_decision changes from NULL to a value
  IF NEW.moderator_decision IS NOT NULL AND OLD.moderator_decision IS NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, market_id)
    SELECT ur.user_id,
      CASE NEW.moderator_decision
        WHEN 'approve' THEN 'Market Review: Approved by Moderator ✅'
        ELSE 'Market Review: Rejected by Moderator ❌'
      END,
      'A moderator has ' || 
      CASE NEW.moderator_decision WHEN 'approve' THEN 'recommended approval' ELSE 'recommended rejection' END ||
      ' for "' || NEW.title || '". Final decision required.',
      'pending_review',
      NEW.id
    FROM public.user_roles ur
    WHERE ur.role = 'super_admin';
  END IF;
  RETURN NEW;
END;
$$;
