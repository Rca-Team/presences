import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Safe client initializer.
 *
 * Why this exists:
 * In some remixed projects, `import.meta.env.VITE_SUPABASE_URL` can end up undefined at runtime,
 * which makes `createClient` throw "supabaseUrl is required" and blank the app.
 *
 * We keep this logic outside the auto-generated client.ts and provide a hard fallback.
 */
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Public values (safe to embed) as a last-resort fallback.
// These match the backend this project is connected to.
const FALLBACK_SUPABASE_URL = 'https://pziiwqqnjwotqxvxdics.supabase.co';
const FALLBACK_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6aWl3cXFuandvdHF4dnhkaWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MjE5NTYsImV4cCI6MjA4NDE5Nzk1Nn0.nqeWxqkj03EgRSYHyySNoqalBKoBmk9ZWpzeD9Yp9Vg';

const SUPABASE_URL = envUrl || FALLBACK_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = envKey || FALLBACK_SUPABASE_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
