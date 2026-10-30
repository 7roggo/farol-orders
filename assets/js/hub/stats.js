// Sales: orders, revenue, average order, best sellers, busiest hours.
import { html, useState, useEffect } from '../vendor/preact-htm.js?v=202610300621';
import { money, localNow } from '../core/util.js?v=202610300621';
import { Empty } from './ui.js?v=202610300621';

const PAID = ['accepted', 'ready', 'completed'];
const shiftDate = (iso, days) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

function Bars({ data, format, label }) {
  const every = data.length > 16 ? 4 : data.length > 10 ? 2 : 1;   // thin out axis labels so they never collide
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = data.reduce((a, b) => (b.value > a.value ? b : a), data[0] || { value: 0 });
  return html`<div class="h-bars" role="img" aria-label=${label}>
    ${data.map((d, i) => html`<div class="h-bar-col" title=${`${d.label}: ${format(d.value)}`}>
      <div class="h-bar-track">
        ${d === top && d.value > 0 && html`<span class="h-bar-value">${format(d.value)}</span>`}
        <div class="h-bar" style=${`height:${(d.value / max) * 100}%`}></div>
      </div>
      <span class="h-bar-label">${i % every === 0 ? d.short ?? d.label : '\u00a0'}</span>
    </div>`)}
  </div>`;
}

export function StatsView({ api, t, r, lang }) {
  const [range, setRange] = useState('today');
  const [orders, setOrders] = useState(null);
  const today = localNow(r.timezone).isoDate;
  const span = { today: [today, today], yesterday: [shiftDate(today, -1), shiftDate(today, -1)], last7: [shiftDate(today, -6), today], last30: [shiftDate(today, -29), today] }[range];

  useEffect(() => { setOrders(null); api.listOrdersBetween(r.id, span[0], span[1]).then(setOrders); }, [range, r.id]);

  const fmt = (c) => money(c, r.currency, lang);
  if (!orders) return html`<p class="h-muted">…</p>`;
  const paid = orders.filter((o) => PAID.includes(o.status));
  const revenue = paid.reduce((s, o) => s + o.total_cents, 0);
  const declined = orders.filter((o) => o.status === 'declined').length;

  const products = new Map();
  for (const o of paid) for (const l of o.lines) {
    const key = l.name_es || l.name_en;
    const p = products.get(key) || { name: key, qty: 0, cents: 0 };
    p.qty += l.qty; p.cents += l.line_cents; products.set(key, p);
  }
  const best = [...products.values()].sort((a, b) => b.qty - a.qty || b.cents - a.cents).slice(0, 10);

  const hours = Array.from({ length: 24 }, (_, h) => ({ h, value: 0 }));
  for (const o of paid) {
    const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: r.timezone }).format(new Date(o.created_at)));
    hours[h].value += 1;
  }
  const used = hours.filter((x) => x.value > 0).map((x) => x.h);
  const hourData = used.length
    ? hours.slice(Math.min(...used), Math.max(...used) + 1).map((x) => ({ label: `${String(x.h).padStart(2, '0')}:00`, short: String(x.h).padStart(2, '0'), value: x.value }))
    : [];

  const days = [];
  if (range === 'last7' || range === 'last30') {
    for (let d = span[0]; d <= span[1]; d = shiftDate(d, 1)) {
      const v = paid.filter((o) => o.local_date === d).reduce((s, o) => s + o.total_cents, 0);
      days.push({ label: new Date(d + 'T12:00:00Z').toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { weekday: 'short', day: 'numeric', month: 'short' }),
        short: d.slice(8), value: v });
    }
  }

  return html`<div class="h-stats">
    <div class="h-seg h-seg-range" role="radiogroup" aria-label="Fechas">
      ${['today', 'yesterday', 'last7', 'last30'].map((k) => html`<label class=${range === k ? 'is-on' : ''}>
        <input type="radio" name="range" checked=${range === k} onChange=${() => setRange(k)} />${t[k]}</label>`)}
    </div>
    <div class="h-kpis">
      <div class="h-kpi"><span class="h-kpi-value">${paid.length}</span><span class="h-kpi-label">${t.kpiOrders}</span></div>
      <div class="h-kpi"><span class="h-kpi-value">${fmt(revenue)}</span><span class="h-kpi-label">${t.kpiRevenue}</span></div>
      <div class="h-kpi"><span class="h-kpi-value">${fmt(paid.length ? Math.round(revenue / paid.length) : 0)}</span><span class="h-kpi-label">${t.kpiAvg}</span></div>
      <div class="h-kpi"><span class="h-kpi-value">${declined}</span><span class="h-kpi-label">${t.kpiDeclined}</span></div>
    </div>
    ${!orders.length ? html`<${Empty}>${t.noData}</${Empty}>` : html`
      <div class="h-stats-grid">
        <section class="h-panel">
          <h2>${t.bestSellers}</h2>
          <table class="h-table">
            <thead><tr><th></th><th class="is-num">${t.units}</th><th class="is-num">${t.revenue}</th></tr></thead>
            <tbody>${best.map((p) => html`<tr><td>${p.name}</td><td class="is-num">${p.qty}</td><td class="is-num">${fmt(p.cents)}</td></tr>`)}</tbody>
          </table>
        </section>
        <section class="h-panel">
          <h2>${t.byHour}</h2>
          <${Bars} data=${hourData} format=${(v) => String(v)} label=${t.byHour} />
          ${days.length > 0 && html`<h2 class="h-mt">${t.byDay}</h2>
            <${Bars} data=${days} format=${fmt} label=${t.byDay} />`}
        </section>
      </div>`}
    <p class="h-muted h-small">${t.revenueNote}</p>
  </div>`;
}
