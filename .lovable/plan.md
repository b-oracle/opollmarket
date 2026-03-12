

## Plan: Update FAQ AI System Prompt with Accurate Platform Information

### Problem
The FAQ AI assistant's system prompt contains outdated/incorrect information, leading to wrong responses about deposits, withdrawals, security PINs, and other features.

### Key Corrections Identified

**1. Deposits & Withdrawals (major rewrite)**
- Current: "Supported currencies include USDT, BNB, and others"
- Actual: 20+ crypto options across grouped categories — Stablecoins (USDT on BEP20/TRC20/ERC20/Polygon/SOL, USDC on ERC20/SOL/Polygon/BEP20, DAI) and Popular Crypto (BTC, ETH, BNB, SOL, LTC, XRP, DOGE, MATIC, AVAX, TON)
- Add: Users select a cryptocurrency and network for both deposits and withdrawals
- Add: Partial deposit handling (if underpaid, credited amount received)
- Add: Deposit expiry window (1 hour)
- Add: Withdrawal limits tied to deposit multiplier, cooldown period between withdrawals, minimum withdrawal amount

**2. Security PIN**
- Current: Not mentioned at all in the FAQ prompt
- Actual: Mandatory 6-digit security PIN (or TOTP/2FA via Google Authenticator) required after registration. PIN is required for login and withdrawals. Users can also set up both PIN + TOTP for layered security.

**3. Quick Trade (missing entirely)**
- Actual: Short-term price prediction feature. Users predict UP or DOWN on crypto (BTC, ETH, BNB, SOL, XRP, DOGE), commodities (Gold, Silver, Oil, etc.), and forex pairs (EUR/USD, GBP/USD, etc.). Fixed timeframes (1, 3, 5, 15 min). Win streaks earn multiplier bonuses. Crypto trades 24/7; forex/commodities follow market hours.

**4. Copy Trading (missing entirely)**
- Actual: Users can follow traders and auto-copy their predictions and Quick Trades. Configurable max copy amount. Pending copy trades require approval. Commission deducted from copier's profit and credited to the original trader.

**5. Verification Tiers (missing)**
- Blue Tick: Hold 10M+ BC400 tokens or qualifying NFTs
- Gold Tick: Hold 100M+ BC400 tokens
- Benefits: Free market creation, trending boosts, revenue sharing

**6. Exit Fee (missing)**
- Users can sell positions before market resolution; an exit fee applies

### File to Edit
- `supabase/functions/faq-ai/index.ts` — Update the `SYSTEM_PROMPT` string (lines 9-115)

### Changes
Rewrite the system prompt sections to reflect accurate information across all the areas listed above, keeping the same structure and strict rules.

