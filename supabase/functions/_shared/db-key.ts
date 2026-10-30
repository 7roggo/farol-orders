/** The printer's secret key is the last part of the URL: /functions/v1/<function>/<key> (or ?k=<key>). */
export function printerKey(req: Request, fnName: string): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && last !== fnName && /^[a-f0-9]{16,64}$/.test(last)) return last;
  const k = url.searchParams.get('k');
  return k && /^[a-f0-9]{16,64}$/.test(k) ? k : null;
}
