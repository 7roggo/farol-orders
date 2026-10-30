// Star Micronics CloudPRNT endpoint.
// Printer setting (printer's web page → CloudPRNT): Server URL = https://<project>.supabase.co/functions/v1/cloudprnt/<printer key>
// Protocol: the printer POSTs every few seconds ("anything for me?"), GETs the job, then DELETEs to confirm.
import { rpc, printerKey, type PollResult, type Ticket } from '../_shared/db.ts';
import { ticketToText } from '../_shared/ticket-format.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const isUuid = (s: string | null) => !!s && /^[0-9a-f-]{36}$/i.test(s);

async function confirm(key: string, url: URL) {
  const code = decodeURIComponent(url.searchParams.get('code') || '');
  const token = url.searchParams.get('token');
  const ok = /^(2\d\d|ok)/i.test(code.trim());
  await rpc('printer_job_result', {
    p_key: key, p_job_id: isUuid(token) ? token : null, p_ok: ok, p_error: ok ? null : code || 'print error',
  });
  return new Response(null, { status: 200 });
}

Deno.serve(async (req) => {
  const key = printerKey(req, 'cloudprnt');
  if (!key) return new Response('missing printer key', { status: 404 });
  const url = new URL(req.url);

  try {
    if (req.method === 'POST') {
      await req.text().catch(() => '');            // printer status JSON (not needed)
      const poll = await rpc<PollResult>('printer_poll', { p_key: key, p_kind: 'star', p_limit: 1 });
      if (!poll) return new Response('unknown printer', { status: 404 });
      const job = poll.jobs[0];
      if (!job) return json({ jobReady: false });
      return json({ jobReady: true, mediaTypes: ['text/plain'], jobToken: job.id });
    }

    if (req.method === 'DELETE') return await confirm(key, url);

    if (req.method === 'GET') {
      if (url.searchParams.has('delete')) return await confirm(key, url);   // printers asked to confirm by GET
      const token = url.searchParams.get('token');
      const job = await rpc<{ id: string; ticket: Ticket } | null>('printer_take_job', {
        p_key: key, p_job_id: isUuid(token) ? token : null,
      });
      if (!job) return new Response('no job', { status: 404 });
      return new Response(ticketToText(job.ticket), {
        status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    return new Response('method not allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return new Response('server error', { status: 500 });
  }
});
