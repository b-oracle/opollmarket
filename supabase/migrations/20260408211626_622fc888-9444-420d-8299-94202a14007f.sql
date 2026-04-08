DROP POLICY "Admins can read all kyc documents" ON storage.objects;

CREATE POLICY "Admins and support can read all kyc documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'kyc-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
  )
);