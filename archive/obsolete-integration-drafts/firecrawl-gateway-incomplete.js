/**
 * ARC Firecrawl Gateway (Cloudflare Worker module helper)
 * Add FIRECRAWL_API_KEY as a Worker secret. Never expose it in browser code.
 * Firecrawl API v2 endpoints: /v2/search and /v2/scrape.
 */
const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2';
const MAX_QUERY_LENGTH = 500;
const MAX_URL_LENGTH = 2048;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ARC_ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : '';
}

function cors(request, env) {
  const origin = allowedOrigin(request, env);
  return origin ? {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type,X-ARC-Case-ID',
    'vary': 'Origin'
  } : {};
}

function requireIdentity(request) {
  const email = (request.headers.get('Cf-Access-Authenticated-User-Email') || '').trim().toLowerCase();
  if (!email) throw Object.assign(new Error('Authentication required'), { status: 401 });
  return email;
}

function requireCaseId(request) {
  const caseId = (request.headers.get('X-ARC-Case-ID') || '').trim();
  if (!caseId) throw Object.assign(new Error('Active ARC case required'), { status: 400 });
  return caseId;
}

function validatePublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw Object.assign(new Error('Invalid URL'), { status: 400 }); }
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('Only HTTP(S) URLs are allowed'), { status: 400 });
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local') || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) {
    throw Object.assign(new Error('Private or local URLs are not allowed'), { status: 400 });
  }
  return url.toString();
}

async function firecrawl(path, env, body) {
  if (!env.FIRECRAWL_API_KEY) throw Object.assign(new Error('Firecrawl is not configured'), { status: 503 });
  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.FIRECRAWL_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await res.json().catch(() => ({ success: false, error: 'Invalid provider response' }));
  if (!res.ok) throw Object.assign(new Error(payload.error || `Firecrawl HTTP ${res.status}`), { status: res.status, provider: payload });
  return payload;
}

export async function handleResearchRoute(request, env) {
  const url = new URL(request.url);
  const headers = cors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    const userEmail = requireIdentity(request);
    const caseId = requireCaseId(request);
    // TODO: enforce D1 case assignment before provider call.
    if (url.pathname === '/research-api/search' && request.method === 'POST') {
      const body = await request.json();
      const query = String(body.query || '').trim();
      if (!query || query.length > MAX_QUERY_LENGTH) throw Object.assign(new Error('Invalid search query'), { status: 400 });
      const result = await firecrawl('/search', env, {
        query,
        limit: Math.min(Math.max(Number(body.limit) || 5, 1), 10),
        scrapeOptions: { formats: [{ type: 'markdown' }] }
      });
      return json({ success: true, caseId, requestedBy: userEmail, retrievedAt: new Date().toISOString(), provider: 'firecrawl', result }, 200, headers);
    }
    if (url.pathname === '/research-api/scrape' && request.method === 'POST') {
      const body = await request.json();
      const target = validatePublicUrl(String(body.url || '').slice(0, MAX_URL_LENGTH));
      const result = await firecrawl('/scrape', env, {
        url: target,
        formats: [{ type: 'markdown' }],
        onlyMainContent: body.onlyMainContent !== false
      });
      return json({ success: true, caseId, requestedBy: userEmail, retrievedAt: new Date().toISOString(), sourceUrl: target, provider: 'firecrawl', result }, 200, headers);
    }
    return json({ error: 'Research endpoint not found' }, 404, headers);
  } catch (error) {
    return json({ error: error.message || 'Research request failed' }, error.status || 500, headers);
  }
}
