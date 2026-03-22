import { lazy, Suspense, type ReactNode } from "react";

const WagmiProviderLazy = lazy(() =>
  import("@/lib/wagmi").then(({ config }) =>
    import("wagmi").then(({ WagmiProvider }) => ({
      default: ({ children }: { children: ReactNode }) => (
        <WagmiProvider config={config}>{children}</WagmiProvider>
      ),
    }))
  )
);

/**
 * Loads the web3 stack via React.lazy / Suspense.
 * Children always render inside WagmiProvider so hooks like useAccount never
 * fire outside the provider context.
 */
const LazyWagmiProvider = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={null}>
    <WagmiProviderLazy>{children}</WagmiProviderLazy>
  </Suspense>
);

export default LazyWagmiProvider;
