# KYC (Know Your Customer) Model for Withdrawal Access

## Overview

Currently, **zero identity verification** is required before withdrawals. Any authenticated user can request a withdrawal immediately. This plan adds a tiered KYC system that gates withdrawals behind identity verification.

## KYC Tier Design

```text
┌─────────────────────────────────────────────────────┐
│  Tier 0 — Unverified (default)                      │
│  • Can deposit, trade, browse                       │
│  • NO withdrawals allowed                           │
│                                                     │
│  Tier 1 — Basic KYC                                 │
│  • Full name + date of birth + phone number         │
│  • Selfie photo holding a note with date, full name
And "Opollmarket"            │
│  • Withdraw up to $500/day                          │
│                                                     │
│  Tier 2 — Full KYC                                  │
│  • Government-issued ID (front + back upload)
- Address and utility bill that shows the address.       │
│  • Selfie matched against ID photo (manual review)  │
│  • Withdraw up to $50,000/day                       │
└─────────────────────────────────────────────────────┘
```

## Technical Plan

### 1. Database: New `kyc_submissions` table + profile column

**Migration:**

- Add `kyc_status` column to `profiles` (`none`, `pending`, `tier1`, `tier2`, `rejected`)
- Create `kyc_submissions` table:
  - `id`, `user_id`, `tier` (1 or 2), `status` (pending/approved/rejected)
  - `full_name`, `date_of_birth`, `phone_number`
  - `selfie_url`, `id_front_url`, `id_back_url`
  - `admin_note`, `reviewed_by`, `reviewed_at`
  - `created_at`, `updated_at`
- RLS: users can INSERT/SELECT own submissions; admins can SELECT/UPDATE all
- Storage bucket `kyc-documents` (private, no public access)

### 2. Withdrawal gate — enforce KYC in Edge Functions

Modify **3 withdrawal Edge Functions** (`request-withdrawal`, `request-payaza-withdrawal`, `request-flutterwave-withdrawal`):

- After the blocked-user check, query `profiles.kyc_status`
- If `none` or `pending` → reject with message: "Identity verification required before withdrawals. Complete KYC in your profile settings."
- If `tier1` → enforce $500/day limit
- If `tier2` → enforce $50,000/day limit (existing cap)

### 3. User-facing KYC submission UI

New component `src/components/KycSubmissionForm.tsx`:

- **Tier 1 form**: Full legal name, date of birth, phone number, selfie upload
- **Tier 2 form** (unlocked after Tier 1 approved): ID front/back upload
- Show current KYC status badge on Profile page
- Images uploaded to `kyc-documents` storage bucket via Supabase storage
- Insert row into `kyc_submissions` and set `profiles.kyc_status = 'pending'`

Integrate into Profile page (`src/pages/Profile.tsx`) as a new section above withdrawal options.

### 4. Admin KYC review panel

New page `src/pages/admin/AdminKyc.tsx`:

- List all pending KYC submissions with user info and uploaded documents
- View selfie + ID images side-by-side
- Approve (sets `kyc_status` to `tier1` or `tier2`) or Reject (with note)
- Sends notification to user on approval/rejection
- Add to admin sidebar navigation

### 5. Withdrawal UI — show KYC prompt

In `DepositWithdrawModal.tsx`:

- If `kyc_status` is `none` or `pending`, replace the withdrawal form with a prompt linking to the KYC form
- If `tier1`, show remaining daily limit ($500)

## File Changes Summary


| File                                      | Change                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Migration SQL                             | Create `kyc_submissions` table, add `kyc_status` to profiles, RLS policies, storage bucket |
| `request-withdrawal/index.ts`             | Add KYC status check + tier-based daily limit                                              |
| `request-payaza-withdrawal/index.ts`      | Same KYC gate                                                                              |
| `request-flutterwave-withdrawal/index.ts` | Same KYC gate                                                                              |
| `src/components/KycSubmissionForm.tsx`    | New — user KYC form with document upload                                                   |
| `src/pages/Profile.tsx`                   | Add KYC section                                                                            |
| `src/pages/admin/AdminKyc.tsx`            | New — admin review panel                                                                   |
| `src/pages/admin/AdminLayout.tsx`         | Add KYC link to sidebar                                                                    |
| `src/components/DepositWithdrawModal.tsx` | Show KYC gate on withdrawal tab                                                            |


## Security Considerations

- All KYC documents stored in a **private** storage bucket — only accessible via service role
- Admin review uses `has_role` check (admin/super_admin only)
- KYC status is set **server-side only** (via admin action or Edge Function) — users cannot self-approve
- Phone number validated server-side before acceptance
- Rate-limited: max 3 KYC submissions per 24 hours to prevent spam