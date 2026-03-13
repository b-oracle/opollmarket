

# Plan: Add Payaza Direct Collection API + Admin Mode Toggle

## Problem
The Payaza checkout domain (`checkout.payaza.africa`) is down, making the current SDK-based flow unusable. We need a server-side alternative using Payaza's Direct Collection API.

## Approach
Add a second fiat deposit mode ("Direct API") that generates a virtual bank account or processes card payments entirely server-side via Payaza's REST API, bypassing the broken checkout domain. Admins can switch between "Checkout (SDK)" and "Direct API (Collection)" from settings.

## Steps

### 1. Database: Add `fiat_deposit_payaza_mode` to feature_toggles
Insert a new feature toggle row with `feature_key = 'fiat_deposit_payaza_mode'` and a default value stored in the label to indicate mode. Since feature_toggles only has `enabled` boolean, we'll use a different approach: add a `payaza_mode` column to `commission_settings` (text, default `'direct_api'`, values: `'checkout_sdk'` | `'direct_api'`). This keeps it consistent with other admin-configurable settings.

### 2. Update `create-payaza-deposit` Edge Function
- When mode is `direct_api`: call Payaza's Collection REST API (`https://router.payaza.africa/api/v1/collection/`) server-side to initiate a payment, returning a virtual account number or payment link to the frontend.
- When mode is `checkout_sdk`: keep existing behavior (return merchant_key + reference for popup).
- Read the mode from `commission_settings.payaza_mode`.

### 3. Update `DepositWithdrawModal.tsx` Frontend
- After calling `create-payaza-deposit`, check the response `mode` field:
  - `checkout_sdk`: open popup window as before (existing flow).
  - `direct_api`: show an in-app "awaiting_fiat" screen with virtual account details (account number, bank name, amount) similar to the crypto deposit screen, with copy buttons and a polling indicator.
- Reuse the existing `awaiting_fiat` step but enhance it to display bank transfer details when in direct API mode.

### 4. Admin Settings: Add Payaza Mode Selector
- In `AdminSettings.tsx`, add a "Fiat Payment Mode" radio/select under the existing settings, allowing admins to choose between:
  - **Checkout SDK** (popup — requires checkout.payaza.africa to be online)
  - **Direct API** (server-side — virtual account/bank transfer)
- Save to `commission_settings.payaza_mode`.

### 5. Webhook Enhancement
- The existing `payaza-webhook` already handles confirmation generically. No changes needed since the Direct API webhook format is the same.

## Technical Details

### Direct API Request (Edge Function)
```
POST https://router.payaza.africa/api/v1/collection/
Headers: Authorization: Payaza <PAYAZA_SECRET_KEY>
Body: {
  "service_type": "Account",
  "service_payload": {
    "request_application": "Payaza",
    "application_module": "USER_MODULE",
    "application_version": "1.0.0",
    "request_class": "PayazaCheckout",
    "request_type": "PayazaCheckout",
    "payaza_account_number": "<merchant_account>",
    "transaction_reference": "<unique_ref>",
    "amount": 5000,
    "currency": "NGN",
    "callback_url": "<webhook_url>",
    "customer": {
      "email": "user@email.com",
      "first_name": "User",
      "last_name": "Name"
    }
  }
}
```

The response returns either a virtual account or payment link that the user can use to complete the transfer.

### UI Flow (Direct API Mode)
```text
User selects "Fiat (NGN)" → enters amount → confirms
  ↓
Edge Function calls Payaza Collection API
  → returns virtual account details OR payment URL
  ↓
Frontend shows bank transfer details in-app:
  - Bank Name, Account Number, Amount (NGN)
  - Copy buttons, countdown timer
  - Polling indicator for confirmation
  ↓
Payaza webhook confirms → balance credited
```

## Files to Create/Edit
- **Migration**: Add `payaza_mode` column to `commission_settings`
- **`supabase/functions/create-payaza-deposit/index.ts`**: Add direct API mode logic
- **`src/components/DepositWithdrawModal.tsx`**: Handle `direct_api` response with in-app bank details UI
- **`src/pages/admin/AdminSettings.tsx`**: Add Payaza mode selector in settings

