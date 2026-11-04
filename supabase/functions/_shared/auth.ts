/**
 * Study Focus AI — Shared Authentication Verification
 * Verifies Supabase JWT and extracts authenticated user ID.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AuthResult {
  userId: string;
  error?: string;
  status?: number;
}

// Create Supabase client with service role for token verification
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { userId: "", error: "Missing or invalid Authorization header", status: 401 };
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = getSupabaseClient();

  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return { userId: "", error: "Invalid or expired token", status: 401 };
  }

  return { userId: user.id };
}
