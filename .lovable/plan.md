
## Plan: Move Wallet Connection into the Connect Section

**Current state**: The Profile page has two separate sections:
1. **"Wallet Connection"** section (lines 1378-1480) — standalone section with wallet connect/disconnect UI
2. **"Connect"** section (lines 1746-1761) — contains Telegram, WhatsApp, and Follow on X

**Change**: Remove the standalone "Wallet Connection" section and move its content into the "Connect" section, placing it as the first item before Telegram.

### Implementation

**File: `src/pages/Profile.tsx`**

1. **Delete** the entire "Wallet Management" block (lines 1378-1480) — the `<div ref={walletSectionRef}>` wrapper with heading "Wallet Connection" and the `glass rounded-xl` card inside it.

2. **Insert** the wallet card (the inner `<div className="glass rounded-xl p-4">` with all three states: connected, detected, no wallet) into the "Connect" section (line 1749), as the first child inside `<div className="space-y-2">`, before the Telegram and WhatsApp entries. Keep the `ref={walletSectionRef}` on the wallet card div so auto-scroll from `/create` still works.

No other files need changes. The wallet logic (hooks, state, handlers) is already defined at the component level and will work regardless of where the JSX is placed.
