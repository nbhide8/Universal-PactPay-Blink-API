import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// For API routes — uses the same publishable key for now.
// Swap to SUPABASE_SERVICE_ROLE_KEY when you add it in Supabase dashboard.
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;
  return createClient(
    supabaseUrl,
    serviceKey,
    { auth: { persistSession: false } }
  );
}
