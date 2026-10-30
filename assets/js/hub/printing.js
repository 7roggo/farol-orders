// Option 1 printing: this hub screen prints the tickets for the "browser" printers it is set up for.
// With Chrome started in kiosk-printing mode the ticket prints straight away, with no dialog.
import { useEffect, useRef, useState } from '../vendor/preact-htm.js?v=202610301029';
import { store } from '../core/util.js?v=202610301029';
import { ticketToHtmlDocument } from '../../../supabase/functions/_shared/ticket-format.js?v=202610301029';

const DEVICE_KEY = 'farol-device';
// A new screen prints nothing until someone picks its printers (so a manager's phone never
// "steals" kitchen tickets). The demo starts with every browser printer shown on screen.
export const getDevice = (rid, demo) =>
  store.get(`${DEVICE_KEY}-${rid}`, demo ? { printerIds: null, method: 'screen' } : { printerIds: [], method: 'print' });
export const setDevice = (rid, d) => store.set(`${DEVICE_KEY}-${rid}`, d);

/** Prints one ticket through a hidden iframe. Resolves when the print call has returned. */
export function printTicket(ticket) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open(); doc.write(ticketToHtmlDocument(ticket)); doc.close();
    setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { console.error(e); }
      setTimeout(() => { frame.remove(); resolve(); }, 1500);
    }, 250);
  });
}

/**
 * Watches print jobs for this device's printers and prints (or shows) them one at a time.
 * Each job is claimed first, so two screens set up for the same printer never print it twice.
 */
export function usePrintEngine({ api, rid, printers, device, onScreenTicket }) {
  const pending = useRef(new Set());
  const queue = useRef([]);
  const busy = useRef(false);
  const [lastError, setLastError] = useState(null);
  const myIds = (device.printerIds ?? printers.filter((p) => p.kind === 'browser').map((p) => p.id))
    .filter((id) => printers.some((p) => p.id === id && p.kind === 'browser' && p.active));

  const run = async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length) {
      const job = queue.current.shift();
      try {
        if (!(await api.claimJob(job.id))) { pending.current.delete(job.id); continue; }
        if (device.method === 'screen') onScreenTicket(job);
        else await printTicket(job.ticket);
        await api.markJob(job.id, true);
        setLastError(null);
      } catch (e) {
        console.error(e);
        setLastError(String(e.message || e));
        await api.markJob(job.id, false, String(e.message || e)).catch(() => {});
      }
      pending.current.delete(job.id);
    }
    busy.current = false;
  };
  const take = (job) => {
    if (!job || job.status !== 'queued' || !myIds.includes(job.printer_id) || pending.current.has(job.id)) return;
    pending.current.add(job.id);
    queue.current.push(job);
    run();
  };

  // catch up on anything queued while this screen was closed or offline
  const key = myIds.join(',') + device.method;
  useEffect(() => {
    if (!myIds.length) return;
    api.listQueuedJobs(myIds).then((jobs) => jobs.forEach(take)).catch(() => {});
    const beat = () => myIds.forEach((id) => api.printerHeartbeat(id).catch(() => {}));
    beat();
    const i = setInterval(beat, 60000);
    return () => clearInterval(i);
  }, [rid, key]);

  return { myIds, lastError, take };
}
