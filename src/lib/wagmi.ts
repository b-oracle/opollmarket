import { http, createConfig } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { walletConnect } from '@wagmi/connectors';

// WalletConnect project ID - replace with your own from https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = '0b0a3d32982bfe46483fee3e58e1528f';

const connectors = WALLETCONNECT_PROJECT_ID
  ? [
      walletConnect({
        projectId: WALLETCONNECT_PROJECT_ID,
        showQrModal: true,
        metadata: {
          name: 'OPOLL',
          description: 'Social Prediction Market',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://opollmarket.lovable.app',
          icons: [typeof window !== 'undefined' ? `${window.location.origin}/favicon.ico` : ''],
        },
      }),
    ]
  : [];

export const config = createConfig({
  chains: [bsc],
  connectors,
  transports: {
    [bsc.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
