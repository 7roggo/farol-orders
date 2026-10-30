// New-order alerts: a repeating chime and a flashing tab title until someone reacts.
import { useEffect, useRef } from '../vendor/preact-htm.js';

let ctx = null;
export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  } catch { return false; }
}
export const audioReady = () => !!ctx && ctx.state === 'running';

/** Two bright notes — loud enough for a kitchen, short enough not to annoy. */
export function chime(kind = 'order') {
  if (!ctx || ctx.state !== 'running') return;
  const notes = kind === 'order' ? [880, 1318.5, 880, 1318.5] : [659.3, 987.8];
  notes.forEach((f, i) => {
    const t0 = ctx.currentTime + i * 0.18;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start(t0); o.stop(t0 + 0.18);
  });
}

export function useAlerts({ pending, requests, soundOn, titleBase, newTitle }) {
  const flip = useRef(false);
  useEffect(() => {
    const total = pending + requests;
    if (!total) { document.title = titleBase; return; }
    const ring = () => {
      if (soundOn) chime(pending ? 'order' : 'request');
      flip.current = !flip.current;
      document.title = flip.current ? `🔔 ${newTitle(total)}` : titleBase;
    };
    ring();
    const id = setInterval(ring, 5000);
    return () => { clearInterval(id); document.title = titleBase; };
  }, [pending, requests, soundOn, titleBase]);
}
