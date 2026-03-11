

## Expand Deposit Currency Options with Grouped Dropdown

### Current State
The deposit modal shows 6 crypto options in a button grid (`USDT BSC`, `USDT TRC20`, `USDT ERC20`, `BTC`, `ETH`, `BNB BSC`). This is limited and doesn't include popular options like USDC on various networks, SOL, etc.

### Plan

**`src/components/DepositWithdrawModal.tsx`** — Two changes:

1. **Expand `CRYPTO_OPTIONS` array** with grouped, comprehensive currency list using NOWPayments currency codes:

```text
Stablecoins:
  USDT (BEP20) — usdtbsc
  USDT (TRC20) — usdttrc20  
  USDT (ERC20) — usdterc20
  USDT (Polygon) — usdtmatic
  USDT (SOL) — usdtsol
  USDC (ERC20) — usdcerc20
  USDC (SOL) — usdcsol
  USDC (Polygon) — usdcmatic
  USDC (BEP20) — usdcbsc
  DAI — dai

Popular Crypto:
  Bitcoin — btc
  Ethereum — eth
  BNB (BSC) — bnbbsc
  Solana — sol
  Litecoin — ltc
  XRP — xrp
  DOGE — doge
  MATIC — maticmainnet
  AVAX — avaxc
  TON — ton
```

2. **Replace the 3-column button grid** (lines 556-571) with a searchable/grouped `<select>` dropdown that:
   - Groups options under "Stablecoins" and "Popular Crypto" headers
   - Shows the selected currency clearly with its network label
   - Works well on mobile via native select or a styled dropdown
   - Applies to both deposit ("Pay with") and withdraw ("Receive as") flows

### Backend
No edge function changes needed — `create-deposit` already passes `pay_currency` directly to NOWPayments, which handles the supported currency validation. Same for `request-withdrawal`.

### No database changes required.

