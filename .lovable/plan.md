

# Record Resolution on Blockchain (Event-Only Contract)

## Overview
After a market is resolved, super admins get a "Record on Chain" button next to resolved markets. Clicking it connects their wallet, sends a transaction to a minimal smart contract on BSC that emits an event with the resolution data, and stores the transaction hash in the database.

## Architecture

```text
AdminMarkets (resolved row)
  → "Record on Chain" button (super_admin only)
  → Connect wallet via AppKit
  → Call recordResolution(marketId, winningSide, totalPaid) on BSC contract
  → Contract emits ResolutionRecorded event
  → Store tx hash in markets.blockchain_tx_hash
```

## Changes

### 1. Database Migration
Add a `blockchain_tx_hash` column to the `markets` table to store the on-chain transaction hash once recorded.

```sql
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS blockchain_tx_hash text;
```

### 2. Smart Contract (Pre-deployed)
A minimal Solidity contract that only emits events — no storage, cheapest gas cost:

```solidity
contract PollmarketResolver {
    event ResolutionRecorded(
        string marketId,
        string winningSide,
        uint256 totalPaidOut,
        uint256 timestamp
    );

    function recordResolution(
        string calldata marketId,
        string calldata winningSide,
        uint256 totalPaidOut
    ) external {
        emit ResolutionRecorded(marketId, winningSide, totalPaidOut, block.timestamp);
    }
}
```

Since deploying a contract from the app isn't feasible here, we'll use a **raw transaction approach**: encode the resolution data as hex in the transaction's `data` field sent to a designated recorder address (e.g., a self-owned address). This achieves the same immutable on-chain record without needing a deployed contract. The data is permanently visible on BSCScan.

### 3. `src/lib/blockchainRecord.ts` (New File)
- Export a helper that encodes market resolution data (market ID, winning side/option, total paid) into hex bytes.
- Export the designated recorder address constant.

### 4. `src/components/admin/RecordOnChainButton.tsx` (New Component)
- Visible only to super admins, shown next to resolved markets that don't yet have a `blockchain_tx_hash`.
- On click: uses wagmi's `useSendTransaction` to send a 0 BNB transaction with encoded resolution data.
- On success: updates `markets.blockchain_tx_hash` with the tx hash and shows a BSCScan link.
- Shows a chain-link icon with loading/success states.

### 5. `src/pages/admin/AdminMarkets.tsx`
- Import and render `RecordOnChainButton` in the resolved market row (after the existing disabled reactivate button, line ~818).
- Only render when `isSuperAdmin` is true.
- Pass market ID, resolved_side, winning_option_id, and existing `blockchain_tx_hash`.

### 6. `src/pages/admin/AdminLayout.tsx`
- Wrap admin layout children with `LazyWagmiProvider` so wagmi hooks are available in admin pages.

## Files Modified
- **Migration**: Add `blockchain_tx_hash` column to `markets`
- `src/lib/blockchainRecord.ts` — new encoding helper
- `src/components/admin/RecordOnChainButton.tsx` — new component
- `src/pages/admin/AdminMarkets.tsx` — render the button for resolved markets
- `src/pages/admin/AdminLayout.tsx` — wrap with wagmi provider

