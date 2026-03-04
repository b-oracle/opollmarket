import { http, createConfig } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { walletConnect } from '@wagmi/connectors';

// WalletConnect project ID - users should replace with their own from https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = '0b0a3d32982bfe46483fee3e58e1528f';

export const config = createConfig({
  chains: [bsc],
  connectors: [
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      showQrModal: true,
      metadata: {
        name: 'OPOLL',
        description: 'Social Prediction Market',
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`],
      },
    }),
  ],
  transports: {
    [bsc.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
