/**
 * arc_ai_gateway.mjs - one AI entry point for every ARC module.
 *
 * Two providers, one rule:
 *   Claude  writes motions and the final report.
 *   Gemini  does everything else.
 *
 * The rule is enforced HERE, on the server, from the task name. A module cannot
 * choose its own provider, cannot send a raw model ID, and never holds a key.
 * Both keys are Worker secrets and neither is ever returned to a browser.
 *
 * Bindings:  DB (D1, for provider_log)
 * Secrets:   GOOGLE_API_KEY, ANTHROPIC_API_KEY
 * Vars:      ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_ORIGINS,
 *            CLAUDE_MODEL (default claude-sonnet-4-6)
 *
 * Routes:
 *   POST /ai/run        { task, payload }  -> provider chosen by task
 *   /ai/google/*         authenticated Gemini SDK passthrough (key injected server-side)
 *   GET  /ai/policy     the routing table, so a module can show what it uses
 */

import { verifyAccessJwt, json, now, uuid } from './lib.mjs';

/* ------------------------------------------------------------------ policy --
   Every task an ARC module may ask for. Adding a module means adding a line
   here; there is no default-allow. A task not in this table is refused.
   -------------------------------------------------------------------------- */
export const TASK_POLICY = {
  // Claude: the two places a document is written for a human to file or send.
  'motion.draft':          { provider: 'claude', roles: ['attorney', 'supervisor', 'administrator'] },
  'motion.revise':         { provider: 'claude', roles: ['attorney', 'supervisor', 'administrator'] },
  'report.final.draft':    { provider: 'claude', roles: ['investigator', 'supervisor', 'administrator', 'attorney'] },
  'report.final.revise':   { provider: 'claude', roles: ['investigator', 'supervisor', 'administrator', 'attorney'] },

  // Gemini: extraction, review, and analysis across every other module.
  'evidence.extract':      { provider: 'gemini', model: 'extract' },
  'discovery.review':      { provider: 'gemini', model: 'extract' },
  'custody.analyze':       { provider: 'gemini', model: 'extract' },
  'video.audit':           { provider: 'gemini', model: 'video' },
  'audio.transcribe':      { provider: 'gemini', model: 'audio' },
  'timeline.normalize':    { provider: 'gemini', model: 'extract' },
  'parties.extract':       { provider: 'gemini', model: 'extract' },
  'board.command':         { provider: 'gemini', model: 'extract' },
  'notebook.query':        { provider: 'gemini', model: 'extract' },
  'notebook.summarize':    { provider: 'gemini', model: 'extract' },
  'investigation.leads':   { provider: 'gemini', model: 'extract' },
  'oui.analyze':           { provider: 'gemini', model: 'extract' },
  'breath.analyze':        { provider: 'gemini', model: 'extract' },
  'lab.analyze':           { provider: 'gemini', model: 'extract' },
  'map.ground':            { provider: 'gemini', model: 'extract' },
  'intake.extract':        { provider: 'gemini', model: 'extract' },
};

/* Gemini model ladder, matching the shared browser client. A retired ID walks
   down the ladder rather than failing the module. */
const GEMINI_LADDER = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
const GEMINI_ROLES = { extract: 0, video: 0, audio: 0 };  // all start at the ladder head

const MAX_BODY = 2 * 1024 * 1024;

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, cf-access-jwt-assertion, x-arc-case-id, x-goog-upload-protocol, x-goog-upload-command, x-goog-upload-header-content-length, x-goog-upload-header-content-type, x-goog-upload-offset',
    'Vary': 'Origin',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

async function logProvider(env, { actor, provider, task, caseId, inChars, outChars, ok }) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO provider_log (id, at, actor, provider, route, case_id, request_chars, response_chars, ok) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(uuid(), now(), actor, provider, task, caseId || '', inChars | 0, outChars | 0, ok ? 1 : 0).run();
  } catch (e) {
    /* logging must never fail a request */
  }
}

/* -------------------------------------------------------------- providers -- */

async function callClaude(env, { system, prompt, maxTokens }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: Math.min(Number(maxTokens) || 8000, 16000),
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw Object.assign(new Error('Claude request failed: ' + r.status), { status: 502, detail: detail.slice(0, 300) });
  }
  const data = await r.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) throw Object.assign(new Error('Claude returned an empty response.'), { status: 502 });
  return text;
}

async function callGemini(env, { system, prompt, parts, schema, startAt }) {
  const body = {
    contents: [{ role: 'user', parts: parts && parts.length ? parts : [{ text: String(prompt || '') }] }],
    generationConfig: {},
  };
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = schema;
  }
  if (system) body.systemInstruction = { parts: [{ text: String(system) }] };

  const ladder = GEMINI_LADDER.slice(startAt || 0);
  let lastError = null;

  for (const model of ladder) {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GOOGLE_API_KEY },
        body: JSON.stringify(body),
      }
    );
    if (r.status === 404) { lastError = 'model ' + model + ' is retired'; continue; }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      throw Object.assign(new Error('Gemini request failed: ' + r.status), { status: 502, detail: detail.slice(0, 300) });
    }
    const data = await r.json();
    const blocked = data.promptFeedback && data.promptFeedback.blockReason;
    if (blocked) throw Object.assign(new Error('Gemini blocked this request (' + blocked + '). Nothing was returned.'), { status: 422 });
    const cand = (data.candidates || [])[0];
    if (!cand) throw Object.assign(new Error('Gemini returned no content.'), { status: 502 });
    if (cand.finishReason === 'MAX_TOKENS') {
      throw Object.assign(new Error('The response was cut off before completing. Split the input and rerun so no record is silently dropped.'), { status: 422 });
    }
    const text = (cand.content && cand.content.parts || []).map(p => p.text || '').join('').trim();
    if (!text) throw Object.assign(new Error('Gemini returned an empty response.'), { status: 502 });
    return { text, model };
  }
  throw Object.assign(new Error('Every Gemini model on the ladder was rejected: ' + lastError), { status: 502 });
}

/* ------------------------------------------------------------------ routes -- */

export async function handleRequest(request, env) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/ai\/?/, '').replace(/\/+$/, '');

  try {
    if (path === 'policy' && request.method === 'GET') {
      const table = {};
      Object.keys(TASK_POLICY).forEach(t => { table[t] = TASK_POLICY[t].provider; });
      return json({ policy: table, geminiLadder: GEMINI_LADDER, claudeModel: env.CLAUDE_MODEL || 'claude-sonnet-4-6' }, 200, cors);
    }

    const identity = await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion') || '', env);
    const actor = identity.email;

    let user = null;
    if (env.DB) {
      user = await env.DB.prepare('SELECT * FROM legal_users WHERE email=?').bind(actor).first();
      if (!user || user.status !== 'active' || user.role === 'pending') {
        throw Object.assign(new Error('Account pending or disabled. Contact an administrator.'), { status: 403 });
      }
    }

    /* ---- SDK passthrough -------------------------------------------------
       The OUI/Drug app uses the @google/genai SDK, which builds its own request
       shapes. Rewriting it against /ai/run would mean touching every call site,
       so instead it points its baseUrl here and we inject the key. Access, role,
       model allowlist, and provider logging all still apply. Claude is NOT
       reachable this way: the SDK path is Gemini only, by construction.
       -------------------------------------------------------------------- */
    if (path.startsWith('google/')) {
      const upstreamPath = path.slice('google/'.length);
      const model = (upstreamPath.match(/models\/([^:/?]+)/) || [])[1] || '';
      const sdkModels = [...GEMINI_LADDER, env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image'];
      if (model && !sdkModels.includes(model)) {
        throw Object.assign(
          new Error('Model "' + model + '" is not approved by the ARC gateway. Allowed: ' + sdkModels.join(', ')),
          { status: 400 }
        );
      }

      const len = Number(request.headers.get('content-length') || 0);
      if (len > MAX_BODY) throw Object.assign(new Error('Gateway control request too large'), { status: 413 });
      const hasBody = !['GET', 'HEAD', 'DELETE'].includes(request.method);
      const bodyBytes = hasBody ? await request.arrayBuffer() : null;
      if (bodyBytes && bodyBytes.byteLength > MAX_BODY) {
        throw Object.assign(new Error('Gateway control request too large'), { status: 413 });
      }

      const headers = { 'x-goog-api-key': env.GOOGLE_API_KEY };
      const contentType = request.headers.get('content-type');
      if (contentType) headers['content-type'] = contentType;
      for (const name of [
        'x-goog-upload-protocol', 'x-goog-upload-command',
        'x-goog-upload-header-content-length', 'x-goog-upload-header-content-type',
        'x-goog-upload-offset'
      ]) {
        const value = request.headers.get(name);
        if (value) headers[name] = value;
      }

      const upstream = await fetch(
        'https://generativelanguage.googleapis.com/' + upstreamPath + url.search,
        { method: request.method, headers, body: bodyBytes && bodyBytes.byteLength ? bodyBytes : undefined }
      );
      const out = await upstream.text();
      await logProvider(env, {
        actor, provider: 'gemini', task: 'sdk:' + (model || upstreamPath).slice(0, 60),
        caseId: request.headers.get('X-ARC-Case-ID') || '',
        inChars: bodyBytes ? bodyBytes.byteLength : 0, outChars: out.length, ok: upstream.ok,
      });
      const responseHeaders = {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        ...cors,
      };
      const uploadUrl = upstream.headers.get('x-goog-upload-url');
      if (uploadUrl) {
        responseHeaders['x-goog-upload-url'] = uploadUrl;
        responseHeaders['Access-Control-Expose-Headers'] = 'X-Goog-Upload-URL';
      }
      return new Response(out, { status: upstream.status, headers: responseHeaders });
    }

    if (path !== 'run' || request.method !== 'POST') {
      throw Object.assign(new Error('Unknown AI route.'), { status: 404 });
    }

    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_BODY) throw Object.assign(new Error('Request body too large'), { status: 413 });

    let body;
    try { body = await request.json(); }
    catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }

    const task = String(body.task || '').trim();
    const rule = TASK_POLICY[task];
    if (!rule) {
      throw Object.assign(new Error('Unknown task "' + task + '". Add it to the routing policy before a module can call it.'), { status: 400 });
    }
    if (rule.roles && user && !rule.roles.includes(user.role)) {
      throw Object.assign(new Error('Your role may not run ' + task + '.'), { status: 403 });
    }

    /* A module cannot override the provider. This is the whole point of the
       gateway, so an attempt is refused rather than quietly ignored. */
    if (body.provider && body.provider !== rule.provider) {
      throw Object.assign(new Error('Provider is set by task, not by the caller. ' + task + ' runs on ' + rule.provider + '.'), { status: 400 });
    }
    if (body.model) {
      throw Object.assign(new Error('Model IDs are set by the gateway. Send a task, not a model.'), { status: 400 });
    }

    const p = body.payload || {};
    const inChars = JSON.stringify(p).length;
    const caseId = String(body.caseId || p.caseId || '');

    let out, model;
    try {
      if (rule.provider === 'claude') {
        out = await callClaude(env, p);
        model = env.CLAUDE_MODEL || 'claude-sonnet-4-6';
      } else {
        const g = await callGemini(env, Object.assign({}, p, { startAt: GEMINI_ROLES[rule.model] || 0 }));
        out = g.text;
        model = g.model;
      }
    } catch (e) {
      await logProvider(env, { actor, provider: rule.provider, task, caseId, inChars, outChars: 0, ok: false });
      throw e;
    }

    await logProvider(env, { actor, provider: rule.provider, task, caseId, inChars, outChars: out.length, ok: true });
    return json({ task, provider: rule.provider, model, text: out }, 200, cors);

  } catch (e) {
    return json({ error: e.message || 'AI gateway error' }, e.status || 500, cors);
  }
}

export default { fetch: handleRequest };
