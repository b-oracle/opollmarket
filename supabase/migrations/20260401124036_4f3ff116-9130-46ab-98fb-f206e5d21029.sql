
-- Add kyc_status column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'none';

-- Create kyc_submissions table
CREATE TABLE public.kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  full_name text,
  date_of_birth date,
  phone_number text,
  address text,
  selfie_url text,
  id_front_url text,
  id_back_url text,
  utility_bill_url text,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

-- Users can insert own submissions
CREATE POLICY "Users can insert own kyc submissions"
  ON public.kyc_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read own submissions
CREATE POLICY "Users can read own kyc submissions"
  ON public.kyc_submissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all submissions
CREATE POLICY "Admins can read all kyc submissions"
  ON public.kyc_submissions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Admins can update submissions (approve/reject)
CREATE POLICY "Admins can update kyc submissions"
  ON public.kyc_submissions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Create private storage bucket for KYC documents
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder
CREATE POLICY "Users can upload own kyc documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can read own documents
CREATE POLICY "Users can read own kyc documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Admins can read all KYC documents
CREATE POLICY "Admins can read all kyc documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-documents' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));
