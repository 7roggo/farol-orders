// Simulates a Star CloudPRNT printer and an Epson Server Direct Print printer talking to the functions.
// Run: deno run -A --import-map=tests/import_map.json tests/printers.test.ts
import { state } from './mock-db.ts';
let handler: (r: Request) => Promise<Response>;
(Deno as any).serve = (h: any) => { handler = h; };

const KEY = 'abcdef0123456789abcdef0123456789';
const ticket = { kind: 'order', restaurant: 'Casa Lola', number: 7, table: 'Mesa 3', station: 'bar', time: '14:05', date: '30/10/2026', lines: [{ qty: 2, name_es: 'Caña', options: [] }], paper_mm: 80 };
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };

console.log('Star CloudPRNT');
await import('../supabase/functions/cloudprnt/index.ts');
const star = handler!;
const base = `https://x.supabase.co/functions/v1/cloudprnt/${KEY}`;
let r = await star(new Request(base, { method: 'POST', body: '{"status":"23 6 0 0 0 0 0 0 0 ","printerMAC":"00:11:62:aa:bb:cc"}' }));
ok((await r.json()).jobReady === false, 'nothing to print → jobReady false');
state.jobs.push({ id: '11111111-1111-1111-1111-111111111111', ticket, status: 'queued' });
r = await star(new Request(base, { method: 'POST', body: '{}' }));
const poll = await r.json();
ok(poll.jobReady === true && poll.mediaTypes[0] === 'text/plain' && poll.jobToken === state.jobs[0].id, 'job announced with token');
r = await star(new Request(`${base}?uid=&type=text%2Fplain&mac=00%3A11&token=${poll.jobToken}`));
const text = await r.text();
ok(r.status === 200 && text.includes('COMANDA - BARRA') && text.includes('2x Cana'), 'GET returns ticket text');
r = await star(new Request(`${base}?mac=00%3A11&code=200%20OK&token=${poll.jobToken}`, { method: 'DELETE' }));
ok(r.status === 200 && state.jobs[0].status === 'printed', 'DELETE 200 OK marks printed');
r = await star(new Request(`https://x.supabase.co/functions/v1/cloudprnt/${'0'.repeat(32)}`, { method: 'POST', body: '{}' }));
ok(r.status === 404, 'unknown printer key rejected');

console.log('Epson Server Direct Print');
await import('../supabase/functions/epson-print/index.ts');
const epson = handler!;
const eurl = `https://x.supabase.co/functions/v1/epson-print/${KEY}`;
const form = (b: string) => new Request(eurl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: b });
r = await epson(form('ConnectionType=GetRequest&ID=cocina'));
ok(r.status === 200 && (await r.text()) === '', 'empty body when no jobs');
state.jobs.push({ id: '22222222-2222-2222-2222-222222222222', ticket: { ...ticket, number: 8 }, status: 'queued' });
state.jobs.push({ id: '33333333-3333-3333-3333-333333333333', ticket: { ...ticket, number: 9, reprint: true }, status: 'queued' });
r = await epson(form('ConnectionType=GetRequest&ID=cocina'));
const xml = await r.text();
ok(r.headers.get('content-type')!.startsWith('text/xml') && (xml.match(/<ePOSPrint>/g) || []).length === 2, 'two tickets in one response');
ok(xml.includes('<printjobid>22222222-2222-2222-2222-222222222222</printjobid>') && xml.includes('** COPIA **') && xml.includes('<cut type="feed"/>'), 'ePOS XML has job ids, copy mark and cut');
const resp = `<?xml version="1.0" encoding="utf-8"?><PrintResponseInfo Version="2.00"><ePOSPrint><Parameter><devid>local_printer</devid><printjobid>22222222-2222-2222-2222-222222222222</printjobid></Parameter><PrintResponse><response success="true" code="" status="251658262" battery="0"/></PrintResponse></ePOSPrint><ePOSPrint><Parameter><devid>local_printer</devid><printjobid>33333333-3333-3333-3333-333333333333</printjobid></Parameter><PrintResponse><response success="false" code="EPTR_REC_EMPTY" status="0" battery="0"/></PrintResponse></ePOSPrint></PrintResponseInfo>`;
r = await epson(form(`ConnectionType=SetResponse&ID=cocina&ResponseFile=${encodeURIComponent(resp)}`));
ok(state.jobs[1].status === 'printed' && state.jobs[2].status === 'queued', 'URL-encoded result: printed + paper-out requeued');
state.jobs[2].status = 'sent';
r = await epson(form(`ConnectionType=SetResponse&ID=cocina&ResponseFile=${resp.replace('success="false"', 'success="true"')}`));
ok(state.jobs[2].status === 'printed', 'raw (not URL-encoded) result also understood');

console.log(fails ? `\n${fails} FAILED` : '\nAll printer protocol tests passed');
Deno.exit(fails ? 1 : 0);
