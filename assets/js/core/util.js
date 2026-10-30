// Small shared helpers: language picking, money, time, opening hours, allergens.

/** Picks obj[field_lang], falling back to the other language. */
export function pick(obj, field, lang) {
  if (!obj) return '';
  const other = lang === 'es' ? 'en' : 'es';
  return obj[`${field}_${lang}`] || obj[`${field}_${other}`] || '';
}

export function money(cents, currency = 'EUR', lang = 'es') {
  return new Intl.NumberFormat(lang === 'en' ? 'en-IE' : 'es-ES', { style: 'currency', currency })
    .format((cents || 0) / 100);
}

/** "12,50" or "12.50" → 1250 */
export function parseMoney(text) {
  const n = Number(String(text).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function minutesAgo(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function clockTime(iso, tz = 'Europe/Madrid') {
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}

/** Local {dow 1–7 (Mon–Sun), minutes since midnight, isoDate} in a timezone. */
export function localNow(tz = 'Europe/Madrid', at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map((p) => [p.type, p.value]));
  const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday];
  return { dow, minutes: Number(parts.hour) * 60 + Number(parts.minute), isoDate: `${parts.year}-${parts.month}-${parts.day}` };
}

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Same rules as the database: a range ending earlier than it starts runs past midnight. */
export function isOpenNow(enabled, hours, tz, at = new Date()) {
  if (!enabled) return true;
  const { dow, minutes: t } = localNow(tz, at);
  const prev = dow === 1 ? 7 : dow - 1;
  for (const [o, c] of hours?.[dow] || []) {
    const O = toMin(o), C = toMin(c);
    if (C > O ? t >= O && t < C : t >= O) return true;
  }
  for (const [o, c] of hours?.[prev] || []) {
    if (toMin(c) <= toMin(o) && t < toMin(c)) return true;
  }
  return false;
}

export function isPaused(r) {
  return !!(r?.ordering_paused || (r?.paused_until && new Date(r.paused_until) > new Date()));
}

export const DAYS = {
  es: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

export function hoursToday(hours, tz, lang) {
  const { dow } = localNow(tz);
  const ranges = hours?.[dow] || [];
  if (!ranges.length) return lang === 'en' ? 'Closed today' : 'Hoy cerrado';
  return ranges.map(([o, c]) => `${o}–${c}`).join(', ');
}

// The 14 allergens EU rules require restaurants to tell customers about.
export const ALLERGENS = [
  { id: 'gluten', es: 'Gluten', en: 'Gluten', icon: '🌾' },
  { id: 'crustaceans', es: 'Crustáceos', en: 'Crustaceans', icon: '🦐' },
  { id: 'eggs', es: 'Huevo', en: 'Egg', icon: '🥚' },
  { id: 'fish', es: 'Pescado', en: 'Fish', icon: '🐟' },
  { id: 'peanuts', es: 'Cacahuete', en: 'Peanuts', icon: '🥜' },
  { id: 'soy', es: 'Soja', en: 'Soy', icon: '🫘' },
  { id: 'milk', es: 'Lácteos', en: 'Milk', icon: '🥛' },
  { id: 'nuts', es: 'Frutos secos', en: 'Tree nuts', icon: '🌰' },
  { id: 'celery', es: 'Apio', en: 'Celery', icon: '🥬' },
  { id: 'mustard', es: 'Mostaza', en: 'Mustard', icon: '🟡' },
  { id: 'sesame', es: 'Sésamo', en: 'Sesame', icon: '⚪' },
  { id: 'sulphites', es: 'Sulfitos', en: 'Sulphites', icon: '🍷' },
  { id: 'lupin', es: 'Altramuces', en: 'Lupin', icon: '🌼' },
  { id: 'molluscs', es: 'Moluscos', en: 'Molluscs', icon: '🐚' },
];
export const allergenById = Object.fromEntries(ALLERGENS.map((a) => [a.id, a]));

export function uid() {
  return (crypto.randomUUID?.() || 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16));
}

export function randomToken(n = 16) {
  const b = new Uint8Array(n / 2);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Wraps browser storage, which can be unavailable (private mode, embedded previews). */
export const store = {
  get(k, fallback = null) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Price of one unit with the chosen option ids. */
export function unitPrice(item, choiceIds) {
  let p = item.price_cents;
  for (const g of item.options || []) for (const c of g.choices || []) if (choiceIds.includes(c.id)) p += c.price_cents || 0;
  return p;
}
