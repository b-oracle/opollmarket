
What I found

- This looks like a real code issue, not user error.
- I found a direct mismatch between the market image upload code and the current storage rules:
  - `src/pages/Create.tsx` uploads files with a plain filename
  - but the storage policy now requires the file path to start with the signed-in user’s ID
- Because of that, normal banner uploads fail first.
- The create flow then keeps going anyway, deducts funds, and only fails later when saving the market because non-draft markets require `image_url`.
- The missing $12 is likely a held market-creation escrow that was never released after the failure.

Root cause chain

1. Image upload fails
- `src/pages/Create.tsx` uploads to `market-images/<filename>`
- current storage policy requires `market-images/<auth.uid()>/<filename>`

2. Submission does not stop after upload failure
- the upload result is treated as a fulfilled `null`
- the flow continues into balance deduction

3. Market save then fails
- `image_url` ends up empty
- `validate_market_image_url` blocks non-draft market creation

4. Refund handling is incomplete
- if a creation fee escrow was already held, the flow does not reliably release it on technical failure
- rollback math also mixes “escrow-held fee” with “freshly deducted fee”, so the refund path is not clean

Plan

1. Immediate user remediation
- Check Mattolu’s current main balance, bonus balance, held escrow records, and market-creation transactions before adjusting anything
- If the $12 is still sitting in `creation_fee_escrows` as `held`, release it as `refunded`
- Verify there was no duplicate rollback before refunding, so we do not over-credit the account

2. Fix the upload bug
- Update `src/pages/Create.tsx` to upload market images under a user-owned path like:
  - `<user.id>/<timestamp-random>.webp`
- Apply the same fix to `src/pages/admin/AdminCreateMarket.tsx` so admin market creation does not break for the same reason

3. Stop the create flow earlier
- In `src/pages/Create.tsx`, if a local image upload fails or returns no URL, stop immediately
- Do not continue to balance deduction
- Show a clearer message like “Image upload failed. No charge was taken.”

4. Fix refund/escrow handling
- Add one centralized cleanup path for technical failures during market creation
- Refund only amounts actually deducted in that submit attempt
- If a creation fee was already held in escrow, release that escrow as `refunded` on technical failure
- Do not include `marketCreationFee` in rollback math when `escrowId` already exists

5. Harden the flow so this cannot sit for days again
- Add a stale-escrow recovery rule for abandoned/failed creations
- Either auto-refund old held escrows after a safe timeout or surface them clearly for admin recovery
- Tighten balance/escrow RPCs so only the owner or admin can act on them

Validation

- Test market creation with a normal uploaded image
- Test with forced image upload failure and confirm:
  - no balance deduction
  - no held escrow left behind
- Test fee-bypass creation with a technical failure and confirm escrow is refunded
- Test AI-generated image URL flow to ensure that still works
- Re-check Mattolu’s final balance and escrow status after remediation

Technical details

- Files to update:
  - `src/pages/Create.tsx`
  - `src/pages/admin/AdminCreateMarket.tsx`
- Database/backend pieces to adjust:
  - `hold_creation_fee_escrow`
  - `release_creation_fee_escrow`
  - `deduct_market_liquidity`
- Relevant current mismatch:
  - upload code writes plain filenames
  - storage policy requires first folder segment = authenticated user ID
  - market insert/update is blocked when `image_url` is empty for non-draft markets
