import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

/**
 * Singleton stateless Supabase client for read-only queries.
 * Uses a global header function to inject the current access token
 * without competing for browser auth locks (no GoTrueClient session).
 */
let _statelessClient: ReturnType<typeof createClient<Database>> | null = null;

export const createStatelessReadClient = () => {
  if (_statelessClient) return _statelessClient;

  _statelessClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: (() => {
        // Read token lazily on each request from localStorage
        if (typeof window === "undefined" || !SUPABASE_PROJECT_ID) return {};
        try {
          const raw = localStorage.getItem(`sb-${SUPABASE_PROJECT_ID}-auth-token`);
          if (!raw) return {};
          const parsed = JSON.parse(raw);
          const token = parsed?.access_token;
          if (typeof token === "string" && token.split(".").length === 3) {
            return { Authorization: `Bearer ${token}` };
          }
        } catch { /* ignore */ }
        return {};
      })(),
    },
  });
  return _statelessClient;
};