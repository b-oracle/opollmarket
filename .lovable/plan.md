

## Plan: Fix MetaMask Connector Detection

**Problem:** The `useFilteredConnectors` hook filters connectors by `c.type === 'injected'`, but newer versions of wagmi/Reown AppKit may register MetaMask with a different type (e.g., `'metaMask'`). This causes MetaMask to be filtered out even when `window.ethereum` is present.

### Changes

1. **`src/hooks/useFilteredConnectors.ts`**
   - Broaden the connector type filter to also accept connectors where `c.type` or `c.id` includes known wallet identifiers (e.g., `metaMask`, `coinbaseWallet`)
   - Use a more robust detection: allow any connector that isn't `walletConnect` type when an injected provider is detected, OR explicitly check for common connector IDs/types
   - Simplified approach: when `hasInjected` is true, include connectors of type `injected` OR whose `id` matches known injected wallets (`metaMask`, `coinbaseWalletSDK`, etc.)

   ```typescript
   const filtered = useMemo(() => {
     const w = typeof window !== 'undefined' ? (window as any) : null;
     const hasInjected = !!(w?.ethereum || w?.rabby || w?.BinanceChain);
     const injectedIds = ['injected', 'metaMask', 'metaMaskSDK', 'coinbaseWalletSDK', 'rabby', 'binanceWallet', 'io.metamask'];
     return connectors.filter(
       (c) =>
         c.type === 'walletConnect' ||
         (hasInjected && (c.type === 'injected' || injectedIds.includes(c.id)))
     );
   }, [connectors]);
   ```

This ensures MetaMask (and other wallets) are shown as connect options regardless of how wagmi/AppKit registers their connector type.

