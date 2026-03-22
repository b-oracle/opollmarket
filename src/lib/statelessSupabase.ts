import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Singleton stateless Supabase client for public/anon read-only queries.
 * No session management = no extra GoTrueClient instance warnings.
 * Only use for tables accessible via anon key (public RLS policies).
 * For authenticated queries, use the main supabase client from @/integrations/supabase/client.
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
  });
  return _statelessClient;
};
