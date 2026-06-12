import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

// Cliente com service role: ignora RLS, por isso todo INSERT/SELECT
// do backend filtra explicitamente por user_id (vindo do JWT validado).
export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
