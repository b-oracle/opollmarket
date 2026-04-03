
-- Fix profile kyc_status for approved users
UPDATE profiles SET kyc_status = 'tier1'
WHERE id IN (
  '05204946-54e2-4beb-9d97-b7756c756a93',
  'b5b74fe7-c16e-4f4a-a5ae-d4d4baf1110f',
  '5ce4daab-7026-4059-87e5-aef29fd7e8a4',
  'fa7849a0-f3d5-49b1-84e0-0129efc06307',
  '9934d6cb-dcaf-4188-b988-2add8437f418'
);

-- Fix profile kyc_status for rejected users
UPDATE profiles SET kyc_status = 'rejected'
WHERE id IN (
  'b383fbc7-e2b0-4005-8ff9-77ce81e2be02',
  '11fc7c60-df07-4933-ac72-51b5c0114bae',
  'a6fa9f11-324a-4b13-85b2-56e5d9fdec94'
);

-- Send approval notifications
INSERT INTO notifications (user_id, title, message, type)
VALUES
  ('05204946-54e2-4beb-9d97-b7756c756a93', 'KYC Approved ✓', 'Your Tier 1 identity verification has been approved. You can now withdraw up to $500/day.', 'info'),
  ('b5b74fe7-c16e-4f4a-a5ae-d4d4baf1110f', 'KYC Approved ✓', 'Your Tier 1 identity verification has been approved. You can now withdraw up to $500/day.', 'info'),
  ('5ce4daab-7026-4059-87e5-aef29fd7e8a4', 'KYC Approved ✓', 'Your Tier 1 identity verification has been approved. You can now withdraw up to $500/day.', 'info'),
  ('fa7849a0-f3d5-49b1-84e0-0129efc06307', 'KYC Approved ✓', 'Your Tier 1 identity verification has been approved. You can now withdraw up to $500/day.', 'info'),
  ('9934d6cb-dcaf-4188-b988-2add8437f418', 'KYC Approved ✓', 'Your Tier 1 identity verification has been approved. You can now withdraw up to $500/day.', 'info');

-- Send rejection notifications
INSERT INTO notifications (user_id, title, message, type)
VALUES
  ('b383fbc7-e2b0-4005-8ff9-77ce81e2be02', 'KYC Rejected', 'Your identity verification was rejected. Please resubmit with correct documents.', 'warning'),
  ('11fc7c60-df07-4933-ac72-51b5c0114bae', 'KYC Rejected', 'Your identity verification was rejected. Please resubmit with correct documents.', 'warning'),
  ('a6fa9f11-324a-4b13-85b2-56e5d9fdec94', 'KYC Rejected', 'Your identity verification was rejected. Please resubmit with correct documents.', 'warning');
