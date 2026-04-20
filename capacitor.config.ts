/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.opollmarket.app',
  appName: 'opollmarket',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      launchFadeOutDuration: 300,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  android: {
    buildOptions: {
      keystorePath: '/Users/macbook/opollmarket-r-key.jks',
      keystorePassword: 'thelastofus1',
      keystoreAlias: 'opollmarket',
      keystoreAliasPassword: 'thelastofus1',
      releaseType: 'AAB',
  
    },
  }
};

export default config;
