

## Problem

The app is stuck on a loading spinner (as shown in the screenshot). The console error reveals the root cause:

```
Object.values requires that input parameter not be null or undefined
getRecomendedWallets @ chunk-2KTKRAPM.js:452
```

This crash originates from the `@web3modal/wagmi` package (v5.1.11) which is installed as a dependency but **not directly imported anywhere in the code**. It's likely auto-initializing through the `@wagmi/connectors` walletConnect connector internals, and crashing because the WalletConnect project ID (`0b0a3d32982bfe46483fee3e58e1528f`) is invalid/expired, causing a null response that `Object.values()` can't handle. This crash prevents the entire React tree from rendering.

## Plan

### 1. Remove `@web3modal/wagmi` dependency
This package is not imported anywhere in the codebase but is causing a fatal crash during initialization. Remove it from `package.json`.

### 2. Wrap WagmiProvider initialization with error boundary
In `src/lib/wagmi.ts`, wrap the walletConnect connector creation in a try-catch so that if initialization fails, the app still loads with an empty connectors array. This makes wallet features degrade gracefully instead of crashing the entire app.

### 3. Keep wallet functionality working
The app uses `wagmi` hooks (`useAccount`, `useConnect`, `useDisconnect`) in several components (Profile, Create, Portfolio, WalletButton, CommentsDrawer). These will continue to work with the base `wagmi` + `@wagmi/connectors` packages — `@web3modal/wagmi` is not needed for this.

