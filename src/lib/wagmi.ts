import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { bsc } from '@reown/appkit/networks';
import { createAppKit } from '@reown/appkit/react';

const projectId = '6c625cc1764d2b59af4ebb27a7253cc7';

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [bsc],
});

export const config = wagmiAdapter.wagmiConfig;

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [bsc],
  metadata: {
    name: 'OPOLL',
    description: 'Social Prediction Market',
    url: 'https://opollmarket.lovable.app',
    icons: ['https://opollmarket.lovable.app/logo.png'],
  },
  themeMode: 'dark',
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
