// Picks the backend: your Supabase project when config.js is filled in, otherwise the in-browser demo.
import { createSupabaseApi } from './supabase-api.js?v=202610300457';
import { createDemoApi } from './demo-api.js?v=202610300457';

let instance = null;
export function getApi() {
  if (instance) return instance;
  const cfg = window.FAROL_CONFIG || {};
  // A configured site always runs live; the demo only runs when no backend is set.
  instance = cfg.supabaseUrl && cfg.supabaseAnonKey ? createSupabaseApi(cfg) : createDemoApi();
  return instance;
}

/** Base address of the site, used to build QR links: config.siteUrl or the current folder. */
export function siteBase() {
  const cfg = window.FAROL_CONFIG || {};
  if (cfg.siteUrl) return cfg.siteUrl.replace(/\/?$/, '/');
  return location.href.split(/[?#]/)[0].replace(/[^/]*$/, '');
}
