import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.fbc135e2c42c4d3fbb3ee7385ced809f',
  appName: 'opollmarket',
  webDir: 'dist',
  server: {
    // Production URL so OAuth (Google sign-in) redirects resolve correctly
    // on the native Android/iOS build. For local hot-reload during dev,
    // temporarily swap this to your Lovable preview URL, then revert before
    // running `npx cap sync` for a release build.
    url: 'https://www.opoll.org',
    cleartext: true,
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
      launchAutoHide: false, // JS hides it after first paint via bootNativeUI()
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
};

export default config;
