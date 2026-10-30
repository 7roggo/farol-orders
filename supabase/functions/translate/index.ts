// Auto-translate menu text (Spanish ⇄ English) for logged-in restaurant staff.
// Uses DeepL if you add a DEEPL_API_KEY secret (free plan: 500,000 characters/month),
// otherwise falls back to the free MyMemory service (smaller daily limit).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

async function deepl(texts: string[], from: string, to: string, key: string) {
  const host = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const res = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: { 'authorization': `DeepL-Auth-Key ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: texts, source_lang: from.toUpperCase(), target_lang: to === 'en' ? 'EN-GB' : 'ES' }),
  });
  if (!res.ok) throw new Error(`DeepL ${res.status}`);
  const data = await res.json();
  return (data.translations as { text: string }[]).map((t) => t.text);
}

async function mymemory(texts: string[], from: string, to: string) {
  const out: string[] = [];
  for (const t of texts) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${from}|${to}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory ${res.status}`);
    const data = await res.json();
    out.push(data?.responseData?.translatedText || t);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { authorization: auth } }, auth: { persistSession: false },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'login_required' }, 401);

    const { texts, from = 'es', to = 'en' } = await req.json();
    if (!Array.isArray(texts) || texts.length > 50) return json({ error: 'invalid_request' }, 400);
    const clean = texts.map((t: unknown) => String(t ?? '').slice(0, 500));
    const nonEmpty = clean.map((t, i) => [t, i] as const).filter(([t]) => t.trim());
    if (!nonEmpty.length) return json({ texts: clean });

    const key = Deno.env.get('DEEPL_API_KEY');
    const translated = key
      ? await deepl(nonEmpty.map(([t]) => t), from, to, key)
      : await mymemory(nonEmpty.map(([t]) => t), from, to);
    const result = [...clean];
    nonEmpty.forEach(([, i], n) => { result[i] = translated[n]; });
    return json({ texts: result, engine: key ? 'deepl' : 'mymemory' });
  } catch (e) {
    console.error(e);
    return json({ error: 'translation_failed' }, 502);
  }
});
