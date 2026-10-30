// Stand-in for supabase/functions/_shared/db.ts used by tests/printers.test.ts
export { printerKey } from '../supabase/functions/_shared/db-key.ts';
type Job = { id: string; ticket: Record<string, unknown>; status: string };
export const state = { jobs: [] as Job[], results: [] as unknown[] };
export async function rpc(fn: string, a: Record<string, any>): Promise<any> {
  if (a.p_key !== 'abcdef0123456789abcdef0123456789') return null;
  if (fn === 'printer_poll') return { printer: { id: 'p', name: 'Cocina', paper_mm: 80 }, jobs: state.jobs.filter((j) => j.status === 'queued').slice(0, a.p_limit) };
  if (fn === 'printer_take_job') {
    const j = state.jobs.find((x) => (a.p_job_id ? x.id === a.p_job_id : x.status === 'queued') && x.status !== 'printed');
    if (!j) return null; j.status = 'sent'; return { id: j.id, ticket: j.ticket };
  }
  if (fn === 'printer_job_result') { state.results.push(a); const j = state.jobs.find((x) => x.id === a.p_job_id); if (j) j.status = a.p_ok ? 'printed' : 'queued'; return null; }
  throw new Error('unexpected ' + fn);
}
