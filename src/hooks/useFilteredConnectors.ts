import { useMemo } from 'react';
import { useConnect } from 'wagmi';

export const useFilteredConnectors = () => {
  const { connect, connectors, isPending } = useConnect();

  const filtered = useMemo(() => {
    const w = typeof window !== 'undefined' ? (window as any) : null;
    const hasInjected = !!(w?.ethereum || w?.rabby || w?.BinanceChain);
    return connectors.filter(
      (c) => c.type === 'walletConnect' || (c.type === 'injected' && hasInjected)
    );
  }, [connectors]);

  return { connect, connectors: filtered, isPending };
};
