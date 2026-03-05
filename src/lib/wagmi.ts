import { http, createConfig } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// WalletConnect is disabled until a valid project ID is configured.
// To enable, get a project ID from https://cloud.walletconnect.com
// and set it here or as a secret.

export const config = createConfig({
  chains: [bsc],
  connectors: [injected()],
  transports: {
    [bsc.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
