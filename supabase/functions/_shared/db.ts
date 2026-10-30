// Server-side database access for the printer functions (uses the service role key,
// which Supabase provides to edge functions automatically).
import { createClient } from 'npm:@supabase/supabase-js@2';

export const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export { printerKey } from './db-key.ts';

export type Ticket = Record<string, unknown> & { paper_mm?: number };
export type PollResult = { printer: { id: string; name: string; paper_mm: number }; jobs: { id: string; ticket: Ticket }[] } | null;
