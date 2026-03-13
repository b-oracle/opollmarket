

## Problem

The `get-naira-rate` edge function is **not deployed** (returns 404). This causes two failures:

1. **Client-side**: The deposit modal can't fetch the live rate, so `ngnRate` stays `null` and no NGN conversion preview is shown to the user.
2. **Server-side**: In `create-payaza-deposit`, when the internal call to `get-naira-rate` fails, the fallback logic sets `ngnAmount = amount` -- meaning a $2 USD deposit sends ₦2 to Payaza instead of ₦3,200+. This is why the numbers are wrong.

## Plan

1. **Deploy the `get-naira-rate` edge function** -- it already exists in code (`supabase/functions/get-naira-rate/index.ts`) but was never deployed. This single action fixes both the client preview and the server-side conversion.

2. **Verify the display** -- once deployed, the deposit modal will correctly show:
   - `≈ ₦{rate × USD_input} NGN` on the input screen
   - Correct NGN amount on the bank transfer screen
   - The admin markup (currently set to 2%) will be applied

No code changes are needed -- the logic is already correct. The function just needs to be deployed.

