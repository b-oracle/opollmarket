import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { supabase } from "@/integrations/supabase/client";

const GOOGLE_WEB_CLIENT_ID = "552098177241-7hpvqukp60hja50bb3i7tqtitko2afvk.apps.googleusercontent.com";
const GOOGLE_ANDROID_CLIENT_IDS: string[] = [
  "552098177241-0ocpct216p33b9vdc7kn07fque8c2knl.apps.googleusercontent.com",
];

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

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const getNativeGoogleErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "Google sign-in failed");
  const lower = message.toLowerCase();

  if (lower.includes("cancel")) return "Google sign-in was cancelled.";
  if (lower.includes("nonce")) return "Google sign-in failed because the security nonce did not match. Please try again.";
  if (lower.includes("audience") || lower.includes("aud") || lower.includes("invalid_client") || lower.includes("client id")) {
    return "Google sign-in token was rejected. Add your Web and Android Google Client IDs to the Google sign-in provider in Lovable Cloud, then sync the Android app.";
  }
  return message;
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

  const payload = decodeJwtPayload(loginResult.result.idToken);
  const tokenAudience = payload?.aud;
  const acceptedAudiences = [GOOGLE_WEB_CLIENT_ID, ...GOOGLE_ANDROID_CLIENT_IDS].filter(Boolean);
  if (typeof tokenAudience === "string" && !acceptedAudiences.includes(tokenAudience)) {
    throw new Error(`Google returned a token for an unconfigured client ID (${tokenAudience}). Add this Client ID to the Google provider's accepted Client IDs in Lovable Cloud.`);
  }

  try {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: loginResult.result.idToken,
      nonce,
    });

    if (error) throw error;
    if (!data.session?.access_token || !data.session?.refresh_token || !data.user) {
      throw new Error("Google sign-in completed, but no valid app session was created.");
    }

    const { data: verified, error: verifyError } = await supabase.auth.getUser();
    if (verifyError) throw verifyError;
    if (!verified.user || verified.user.id !== data.user.id) {
      throw new Error("Google sign-in completed, but the app session could not be verified.");
    }

    return { session: data.session, user: verified.user };
  } catch (error) {
    throw new Error(getNativeGoogleErrorMessage(error));
  }
};