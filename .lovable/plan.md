# Native BSC Deposit Listener (USDT / USDC on BSC)

Replace NOWPayments for stablecoin deposits with an on-chain listener that:
1. Generates a unique BSC deposit address per user (HD-derived from a master seed).
2. Polls BSC `Transfer` event logs from USDT/USDC contracts every ~15s.
3. Waits for N confirmations, then credits the user's main balance.
4. Sweeps deposited funds to a hot wallet on a separate schedule (optional, can ship later).

Existing NOWPayments + Payaza flows stay intact as fallbacks.

---

## What the user will see

- New "Deposit (BSC USDT/USDC)" option in the deposit modal.
- One permanent address assigned to their account, shown with QR + copy.
- Live status: "Waiting for transfer" → "Detected (X/12 confirmations)" → "Credited".
- Min deposit $1, no fee taken by us, no provider fee.

---

## Architecture

```text
User wallet ──BSC tx──> per-user deposit address (HD index N)
                                 │
                  bsc-deposit-poller (cron 15s)
                                 │
                  eth_getLogs(Transfer, [USDT, USDC])
                                 │
              insert/update bsc_deposit_events (status: detected)
                                 │
            after >= CONFIRMATIONS blocks → status=confirmed
                                 │
                 RPC credit_bsc_deposit() → +balance + transaction row
                                 │
       bsc-deposit-sweeper (cron, hourly) → ERC20.transfer to hot wallet
```

---

## Database (new)

- `bsc_deposit_addresses` — `(user_id uuid PK, hd_index int unique, address text unique, created_at)`
- `bsc_deposit_events` — `(id, tx_hash, log_index, address, token, amount_wei numeric, amount_usd numeric, block_number bigint, confirmations int, status text [detected|confirmed|credited|orphaned], user_id, credited_tx_id, detected_at, credited_at)` with unique `(tx_hash, log_index)`.
- `bsc_deposit_state` — singleton `(id=1, last_scanned_block bigint, updated_at)`.
- RPC `credit_bsc_deposit(event_id uuid)` — SECURITY DEFINER, atomic: locks event row, marks credited, inserts `transactions` row (type='deposit', payment_provider='bsc_native'), updates user balance.
- RPC `get_or_create_bsc_address(_user_id uuid)` — returns existing address or allocates next hd_index.
- RLS: users select only their own row in `bsc_deposit_addresses` / `bsc_deposit_events`. Service role manages writes.

## Secrets

- `BSC_DEPOSIT_MASTER_SEED` (12/24-word mnemonic OR 32-byte hex) — used to derive `m/44'/60'/0'/0/{index}` addresses. Stored in vault, only read by the address-allocator function.
- `BSC_RPC_URL` — QuickNode/Ankr/Alchemy BSC RPC (HTTPS).
- `BSC_HOT_WALLET_ADDRESS` — destination for sweeps (optional, only needed when sweeper ships).
- Existing `CRON_SECRET` reused for the poller cron auth.

## Edge functions (new)

- `get-bsc-deposit-address` — user-authed; calls `get_or_create_bsc_address`; derives address with viem `mnemonicToAccount` + `hdKey.derive(path)`; persists; returns `{ address }`.
- `bsc-deposit-poller` — cron-only (x-cron-secret); fetches `last_scanned_block`, current `eth_blockNumber`, calls `eth_getLogs` in batches of ≤2000 blocks for the two contracts filtered by `topics[2] in (known addresses)`. Inserts new events as `detected`. Updates `confirmations` on existing detected events; when `>= CONFIRMATIONS_REQUIRED (12)`, calls `credit_bsc_deposit`. Updates `last_scanned_block` only on success.
- `bsc-deposit-sweeper` (deferred — can ship in a follow-up): for each address with balance > threshold, derive privkey, build ERC20 transfer to hot wallet, send via `eth_sendRawTransaction`. Needs BNB for gas at each address (pre-fund or just-in-time top-up).

## Cron

- `bsc-deposit-poller-15s` every 15s (or 30s to start), posting to the function with `x-cron-secret` from vault (matches existing pattern).

## Frontend

- New deposit option card in the deposit modal: "BSC USDT/USDC — instant, no fees".
- New `BscDepositPanel` component: calls `get-bsc-deposit-address`, shows address + QR (use existing `qrcode.react` if present, else add), token chooser (USDT/USDC), min $1 notice, polls `bsc_deposit_events` via realtime channel scoped to the user, renders status timeline.
- Add a row in `TransactionHistory` for `payment_provider='bsc_native'` (existing component already renders any deposit, just add label).

## Token addresses (BSC mainnet)

- USDT (BEP20): `0x55d398326f99059fF775485246999027B3197955` (18 decimals)
- USDC (BEP20): `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` (18 decimals)
- Transfer topic: `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`

## Safety / edge cases

- Idempotency via unique `(tx_hash, log_index)`.
- Reorg protection: 12-confirmation wait (BSC finality is ~45s).
- Unknown-recipient logs are skipped (only credit if `to` matches a row in `bsc_deposit_addresses`).
- USD amount = wei / 1e18 (stablecoins are ~$1, no oracle needed for v1; can add chainlink price feed later).
- Spam: address allocated lazily on first request; one per user, reused forever.
- Audit: every credit writes a `transactions` row + an `audit_logs` row.

## Out of scope for this PR

- Sweeper (will do as follow-up once master-seed flow is validated).
- Multi-chain (Polygon, Base, Arbitrum) — same pattern, separate function per chain.
- Withdrawals — keep current NOWPayments payout for now.

---

## Step-by-step build order

1. Migration: tables, RLS, RPCs.
2. Add `BSC_DEPOSIT_MASTER_SEED` + `BSC_RPC_URL` via `add_secret`.
3. Edge function `get-bsc-deposit-address`.
4. Edge function `bsc-deposit-poller` + cron schedule.
5. Frontend `BscDepositPanel` + integration into deposit modal.
6. Smoke test on testnet/mainnet with a small USDT transfer.
