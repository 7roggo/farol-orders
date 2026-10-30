// Epson Server Direct Print endpoint (TM-m30III, TM-T88VII and other TM-i / SDP models).
// Printer setting (printer's web page → Server Direct Print): URL = https://<project>.supabase.co/functions/v1/epson-print/<printer key>
// Protocol: the printer POSTs ConnectionType=GetRequest; we answer with ePOS-Print XML (or an empty body).
// After printing it POSTs ConnectionType=SetResponse with the result.
import { rpc, printerKey, type PollResult, type Ticket } from '../_shared/db.ts';
import { ticketToEposXml } from '../_shared/ticket-format.js';

const XML_HEADERS = { 'content-type': 'text/xml; charset=utf-8' };
const empty = () => new Response('', { status: 200, headers: XML_HEADERS });

// The printer may send the form URL-encoded or raw ("URL Encode: Disable"), so read both.
function field(body: string, name: string): string | null {
  const m = body.match(new RegExp(`(?:^|&)${name}=([^&]*)`));
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch { return m[1]; }
}
function responseFile(body: string): string {
  const i = body.indexOf('ResponseFile=');
  if (i < 0) return '';
  const raw = body.slice(i + 'ResponseFile='.length);
  if (/%3C/i.test(raw.slice(0, 20))) {
    try { return decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { /* fall through */ }
  }
  return raw;
}

Deno.serve(async (req) => {
  const key = printerKey(req, 'epson-print');
  if (!key) return new Response('missing printer key', { status: 404 });
  if (req.method !== 'POST') return empty();

  try {
    const body = await req.text();
    const type = field(body, 'ConnectionType');

    if (type === 'SetResponse') {
      const file = responseFile(body);
      // One <ePOSPrint> block per ticket: <printjobid>…</printjobid> … <response success="true" …/>
      const blocks = file.match(/<ePOSPrint>[\s\S]*?<\/ePOSPrint>/g) || [];
      for (const b of blocks) {
        const id = b.match(/<printjobid>([^<]+)<\/printjobid>/)?.[1]?.trim() || null;
        const success = /success="true"/i.test(b);
        const code = b.match(/code="([^"]*)"/)?.[1] || '';
        await rpc('printer_job_result', { p_key: key, p_job_id: id, p_ok: success, p_error: success ? null : code || 'print error' });
      }
      if (!blocks.length && file) {
        const success = /success="true"/i.test(file);
        await rpc('printer_job_result', { p_key: key, p_job_id: null, p_ok: success, p_error: success ? null : 'print error' });
      }
      return empty();
    }

    // GetRequest (or anything else): send up to 5 queued tickets
    const poll = await rpc<PollResult>('printer_poll', { p_key: key, p_kind: 'epson', p_limit: 5 });
    if (!poll || !poll.jobs.length) return empty();

    const blocks: string[] = [];
    for (const j of poll.jobs) {
      const job = await rpc<{ id: string; ticket: Ticket } | null>('printer_take_job', { p_key: key, p_job_id: j.id });
      if (!job) continue;
      blocks.push(
        `<ePOSPrint><Parameter><devid>local_printer</devid><timeout>10000</timeout>` +
        `<printjobid>${job.id}</printjobid></Parameter>` +
        `<PrintData>${ticketToEposXml({ ...job.ticket, paper_mm: job.ticket.paper_mm ?? poll.printer.paper_mm })}</PrintData></ePOSPrint>`,
      );
    }
    if (!blocks.length) return empty();
    const xml = `<?xml version="1.0" encoding="utf-8"?><PrintRequestInfo Version="2.00">${blocks.join('')}</PrintRequestInfo>`;
    return new Response(xml, { status: 200, headers: XML_HEADERS });
  } catch (e) {
    console.error(e);
    return empty();
  }
});
