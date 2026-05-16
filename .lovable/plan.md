## Goal

After a new user registers and lands on the app for their first authenticated session, show a stylish "$20 Welcome Bonus — Congratulations!" card with a confetti burst. Tapping the card navigates to the balance breakdown page (`/commissions`).

## Trigger logic

Signup uses email verification, so the user won't be authenticated immediately after submitting the signup form. The cleanest trigger is **on first successful auth session** when the user has never seen the welcome card before.

- Set a localStorage flag `welcome_bonus_shown:{userId}` once the card has been displayed.
- On app mount, if the user is authenticated and the flag is missing, verify they actually received the signup bonus (query `balances.bonus_balance >= 20` or check that their account was created recently — within ~7 days). If so, show the modal and set the flag.
- Also set a transient `pending_welcome_bonus = 1` localStorage key right after a successful signup form submission, so that the very first login after email verification reliably triggers it even if the balance query is slow.

## New component

`src/components/WelcomeBonusModal.tsx` — built in the same visual language as `WinCelebrationModal.tsx` and `StreakMilestoneModal.tsx`:

- Centered glass card, framer-motion spring entrance (scale + fade)
- Large gift/sparkles icon in a glowing primary circle, animated pulse
- Headline: "Congratulations!" 
- Big "$20" amount with gradient text
- Subtitle: "Welcome Bonus added to your balance"
- Floating sparkle particles (reuse the star/particle pattern from `WinCelebrationModal`)
- Primary CTA button "View Balance" → navigates to `/commissions` and closes
- Secondary "Maybe later" text button to dismiss
- Whole card is tappable (button wrapper) → navigates to `/commissions`
- Calls `useConfetti().fireWinConfetti()` on mount for the celebration burst
- Fires `hapticSuccess()` on open

## Wiring

- Add a `WelcomeBonusGate` mounted inside `App.tsx` (alongside other auth-gated overlays), or extend an existing top-level provider, that:
  1. Reads `useAuth()` user.
  2. On user change, checks `localStorage.getItem(\`welcome_bonus_shown:${user.id}\`)`.
  3. If not shown, queries `balances` for the user; if `bonus_balance >= 20` and the row was created within the last 7 days (or `pending_welcome_bonus` flag is set), opens the modal.
  4. On close/navigate, writes the flag and clears `pending_welcome_bonus`.
- In `src/pages/Auth.tsx` signup success branch (line 237–240), add `localStorage.setItem("pending_welcome_bonus", "1")` before the toast/setMode.

## Files

- New: `src/components/WelcomeBonusModal.tsx`
- New: `src/components/WelcomeBonusGate.tsx`
- Edit: `src/App.tsx` — mount `<WelcomeBonusGate />` inside the authenticated layout tree
- Edit: `src/pages/Auth.tsx` — set `pending_welcome_bonus` flag after successful signup

## Out of scope

- No DB / backend / RPC changes. The $20 signup bonus is already credited by the existing `handle_new_user` trigger.
- No changes to notification system or push.
