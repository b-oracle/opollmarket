import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

const readStoredAccessToken = (): string | null => {
  if (typeof window === "undefined" || !SUPABASE_PROJECT_ID) return null;

  try {
    const raw = window.localStorage.getItem(`sb-${SUPABASE_PROJECT_ID}-auth-token`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const token = parsed?.access_token;
    if (typeof token !== "string" || token.split(".").length !== 3) return null;

    return token;
  } catch {
    return null;
  }
};

// Singleton stateless client — avoids spawning multiple GoTrueClient instances
let _statelessClient: ReturnType<typeof createClient<Database>> | null = null;

export const createStatelessReadClient = () => {
  if (_statelessClient) return _statelessClient;

  _statelessClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _statelessClient;
};