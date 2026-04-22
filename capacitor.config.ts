/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.opollmarket.app',
  appName: 'Opoll',
  webDir: 'dist',
  server: {
    url: 'https://fbc135e2-c42c-4d3f-bb3e-e7385ced809f.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  ios: {
    backgroundColor: '#000000',
    contentInset: 'automatic',
  },
  plugins: {
    CapacitorBackgroundMode: {
      enabled: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
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
      useDialog: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
      overlaysWebView: false,
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
  },
};

export default config;
