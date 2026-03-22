import { lazy, Suspense, useState, useEffect, type ReactNode } from "react";

// Dynamically import the heavy wagmi setup only after initial render
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
 * Defers loading the entire web3 stack (~500KB+) until after the first paint.
 * This dramatically improves initial load time for users who don't need wallet features immediately.
 */
const LazyWagmiProvider = ({ children }: { children: ReactNode }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Defer to next idle callback or rAF so the initial paint is not blocked
    if ("requestIdleCallback" in window) {
      const id = (window as any).requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => (window as any).cancelIdleCallback(id);
    } else {
      const id = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, []);

  if (!ready) {
    // Render children without wagmi context; pages that need it are lazy-loaded anyway
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<>{children}</>}>
      <WagmiProviderLazy>{children}</WagmiProviderLazy>
    </Suspense>
  );
};

export default LazyWagmiProvider;
