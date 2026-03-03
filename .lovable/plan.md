

## Architecture Overhaul: Off-Chain First with Minimal Blockchain

The current app is heavily wallet-centric — every page requires wagmi wallet connection, data comes from mock arrays, and all interactions simulate on-chain transactions. The goal is to flip this: **Lovable Cloud (database) becomes the source of truth**, blockchain is only used for deposits, withdrawals, and token-gated market creation.

### What Changes

**1. Dual Authentication System**
- Users can sign up/login with **email+password** OR **wallet connect** (or link both)
- Update the `profiles` table to support both auth methods: email users get a Supabase auth ID, wallet users link their wallet address to a profile
- The existing Auth page already supports email — add a "Connect Wallet" option alongside it
- TopBar gets a unified user button: shows avatar/name if logged in, "Sign In" if not

**2. User Balances — Database, Not Blockchain**
- Create a `balances` table (`user_id`, `amount`, `currency`) tracking each user's platform balance
- Create a `transactions` table (`user_id`, `type`, `amount`, `market_id`, `created_at`, `tx_hash`) for full history
- Deposits: user sends crypto on-chain → admin/system confirms → credits balance in DB
- Withdrawals: user requests → admin/system processes on-chain → debits balance in DB
- Betting: entirely off-chain — deduct from DB balance, credit shares in a `positions` table

**3. Markets — Database as Source of Truth**
- Stop using `mockMarkets` from `src/data/markets.ts` — fetch all markets from the existing `markets` Supabase table
- Feed, Index, MarketDetail all query the DB instead of importing mock data
- Market creation still has token-gate check (wallet required), but the market itself is stored in DB (this already works)
- Market resolution: admin resolves via admin panel, system distributes winnings in DB

**4. Predictions/Betting — Fully Off-Chain**
- Create a `positions` table (`user_id`, `market_id`, `option_id`, `side`, `shares`, `avg_price`, `created_at`)
- BetModal: instead of simulating a wallet transaction, check DB balance → insert position → deduct balance
- No wallet connection required to bet — just a logged-in account with sufficient balance

**5. Components to Refactor**
- **TopBar**: Replace `WalletButton` with a unified auth button (show user avatar if logged in, wallet if connected, or "Sign In")
- **BetModal**: Remove `useAccount` dependency, use `useAuth` + DB balance check
- **DepositWithdrawModal**: Keep wallet connection for deposits/withdrawals only (this is the one place blockchain matters)
- **Profile page**: Show user profile from DB, transaction history from `transactions` table, with optional wallet linking
- **Feed/Index**: Replace `mockMarkets` with Supabase queries
- **MarketDetail**: Fetch from DB, show real positions

**6. Database Migrations Needed**
- `balances` table with RLS (users read own balance)
- `positions` table with RLS (users read own positions, public aggregate reads)
- `transactions` table with RLS (users read own transactions)
- Update `markets` and `market_options` to be the single source of truth (already mostly there)

**7. What Stays On-Chain**
- Wallet connect for deposits/withdrawals
- Token-gate check for market creation (read-only chain call)
- Everything else is off-chain via Lovable Cloud

### Implementation Order
1. **DB migrations**: Create `balances`, `positions`, `transactions` tables with proper RLS
2. **Replace mock data**: Refactor Feed, Index, MarketDetail to query Supabase `markets` table
3. **Unified auth**: Update TopBar and auth flow to support email OR wallet, make wallet optional
4. **Off-chain betting**: Refactor BetModal to use DB balance + positions instead of wallet transactions
5. **Profile overhaul**: Show DB-driven profile, balances, positions, and transaction history
6. **Deposit/Withdraw**: Keep as wallet-only flow but write results to DB `transactions` + `balances`

This is a large refactor touching most pages. I recommend implementing it in phases across multiple messages, starting with the database schema and data migration, then working through the UI components.

