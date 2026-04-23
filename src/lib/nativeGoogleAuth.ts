import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { supabase } from "@/integrations/supabase/client";

const GOOGLE_WEB_CLIENT_ID = "REPLACE_WITH_YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com";

let initializePromise: Promise<void> | null = null;

export const isNativeAndroidGoogleSignIn = () =>
  typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

const hasConfiguredGoogleWebClientId = () =>
  GOOGLE_WEB_CLIENT_ID.endsWith(".apps.googleusercontent.com") && !GOOGLE_WEB_CLIENT_ID.startsWith("REPLACE_WITH_");

const createNonce = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const initializeGoogleSignIn = () => {
  if (!hasConfiguredGoogleWebClientId()) {
    throw new Error("Native Google sign-in needs your Web application Client ID in src/lib/nativeGoogleAuth.ts.");
  }

  initializePromise ??= SocialLogin.initialize({
    google: {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      mode: "online",
    },
  });

  return initializePromise;
};

export const signInWithNativeGoogle = async () => {
  if (!isNativeAndroidGoogleSignIn()) {
    throw new Error("Native Google sign-in is only available in the Android app.");
  }

  await initializeGoogleSignIn();

  const nonce = createNonce();
  const loginResult = await SocialLogin.login({
    provider: "google",
    options: {
      scopes: ["email", "profile"],
      nonce,
      forceRefreshToken: true,
      filterByAuthorizedAccounts: false,
      autoSelectEnabled: false,
    },
  });

  if (loginResult.result.responseType !== "online" || !loginResult.result.idToken) {
    throw new Error("Google did not return a valid identity token.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: loginResult.result.idToken,
    nonce,
  });

  if (error) throw error;
  return data;
};