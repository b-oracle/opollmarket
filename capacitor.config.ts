import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.opoll.app',
  appName: 'OPOLL',
  webDir: 'dist',
  server: {
    url: 'https://opoll.org',
    cleartext: true,
  },
};

export default config;
