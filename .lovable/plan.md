# BSC Deposit Sweep to Main Wallet

Today, every user gets a unique HD-derived BEP20 address (`bsc_deposit_addresses`). USDT/USDC sent there is detected and credited, but the funds stay scattered across thousands of derived addresses. We need to sweep them into one main treasury wallet so funds are usable (withdrawals, accounting, custody).

## The challenge (BSC reality)

Each derived address holds a stablecoin (BEP20) but **no BNB to pay gas**. To sweep, the address itself must send the ERC20 `transfer()` — which costs ~0.0003 BNB. So sweeping is a two-step dance per address:

1. **Gas drip**: hot "gas station" wallet sends a tiny BNB amount to the derived address.
2. **Token sweep**: derived address signs `transfer(treasury, balance)` for the stablecoin.

Both steps need the HD private key derived from `BSC_DEPOSIT_MASTER_SEED` (already in secrets).

## What gets built

### 1. New secrets
- `BSC_TREASURY_ADDRESS` — main wallet destination (checksummed BSC address).
- `BSC_GAS_STATION_PRIVATE_KEY` — funded EOA that pays gas drips. Kept separate from the HD seed so it can be rotated/topped up independently.

### 2. New table: `bsc_sweep_jobs`
Tracks every sweep attempt for auditability.
- `address`, `user_id`, `hd_index`, `token`, `amount_wei`, `amount_usd`
- `status`: `queued` → `gas_funded` → `swept` → `confirmed` / `failed`
- `gas_tx_hash`, `sweep_tx_hash`, `treasury_address`
- `attempts`, `last_error`, `next_attempt_at`

### 3. New edge function: `bsc-sweep-runner` (cron, every 5 min)
Loop:
1. Query all `bsc_deposit_addresses` with token balance ≥ `MIN_SWEEP_USD` (default $5) via `eth_call balanceOf`. To avoid hammering RPC, scope to addresses that received a credited event in the last N days **or** are already queued.
2. For each candidate: insert/upsert a `bsc_sweep_jobs` row.
3. For `queued` jobs: send BNB from gas station → derived address (skip if address already has enough BNB), record `gas_tx_hash`, flip to `gas_funded`.
4. For `gas_funded` jobs whose gas tx has ≥1 confirmation: derive the address's private key from the seed + `hd_index`, sign and broadcast `transfer(treasury, balance)`, record `sweep_tx_hash`, flip to `swept`.
5. For `swept` jobs: wait for ≥3 confirmations on the sweep tx, mark `confirmed`.
6. On any RPC/tx failure: increment `attempts`, set `next_attempt_at` with exponential backoff, cap at 5 retries before `failed` (alerts via `record_system_alert`).

Uses existing `bscRpc` helper for failover + alerting. Concurrency-safe via `FOR UPDATE SKIP LOCKED` on the jobs table.

### 4. New edge function: `admin-bsc-sweep-action`
Admin-only (verifies `has_role('admin')`). Endpoints:
- `POST { action: "trigger" }` — kick the runner immediately.
- `POST { action: "sweep_address", address }` — force-queue a single address.
- `POST { action: "retry", job_id }` — reset a `failed` job to `queued`.

### 5. Admin UI: new "Sweeps" tab in `BscReconciliation.tsx`
Adds a third tab next to Events / Reconciliation:
- **Treasury summary card**: total BNB in gas station, total USDT/USDC currently sitting in derived addresses (sum of balances), total swept (last 30d), pending jobs count.
- **Active jobs table**: status, address, token, amount, gas tx, sweep tx (BscScan links), attempts, last error. Filter by status.
- **Actions**: "Run sweep now" button (calls `admin-bsc-sweep-action`), per-row "Retry" on failed jobs.

### 6. Cron schedule
`pg_cron` entry that hits `bsc-sweep-runner` every 5 minutes (registered via the supabase insert tool, not migration, so it isn't replayed on remix).

## Out of scope (call out, don't build)
- Sweeping BNB itself from derived addresses (they only ever receive BNB from us for gas; leftover dust stays).
- Multi-sig treasury — single EOA destination for now.
- Auto top-up of gas station from treasury — manual for now, with a low-balance alert at <0.05 BNB.
- Other chains (ETH/Polygon/Tron) — BSC only.

## Operator checklist (what user provides before this works)
1. Create a fresh BSC EOA → fund with ~0.5 BNB → save private key as `BSC_GAS_STATION_PRIVATE_KEY`.
2. Decide the treasury address (cold wallet / exchange deposit / multisig) → save as `BSC_TREASURY_ADDRESS`.
3. Approve the migration + cron insert.

## Technical notes
- Uses `viem` (already imported in `get-bsc-deposit-address`) for HD derivation, signing, and tx broadcast — no new deps.
- Nonce management: fetch `eth_getTransactionCount(..., "pending")` per address per send; gas station serializes its sends inside a single runner tick.
- Gas drip amount = `gasPrice * 65_000 * 1.3` (BEP20 transfer ≈ 52k gas + buffer).
- Skip dust: don't sweep if `balance < MIN_SWEEP_USD` to avoid wasting gas (configurable via `app_settings.bsc_min_sweep_usd`).
- All key material stays server-side; admin UI never sees private keys.

Awaiting approval before implementation.
