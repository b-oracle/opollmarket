import { useMemo } from 'react';
import { useConnect } from 'wagmi';

export const useFilteredConnectors = () => {
  const { connect, connectors, isPending } = useConnect();

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

  return { connect, connectors: filtered, isPending };
};
