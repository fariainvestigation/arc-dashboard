import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { handleRequest, TASK_POLICY } from '../cloudflare-worker/ai/arc_ai_gateway.mjs';

/* ---------------------------------------------------------------- gateway -- */

/* The real D1 schema, so a column mismatch fails the test instead of being
   swallowed by logProvider's try/catch at runtime. */
function makeEnv(overrides = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../cloudflare-worker/legal/schema.sql', import.meta.url), 'utf8'));
  db.prepare("INSERT INTO legal_users (email, role, status, created_at, updated_at) VALUES (?,?,?,?,?)")
    .run('raf@arc.test', overrides.role || 'investigator', 'active', 'now', 'now');

  return {
    db,
    GOOGLE_API_KEY: 'gemini-test-key-DO-NOT-LEAK',
    ANTHROPIC_API_KEY: 'sk-ant-test-key-DO-NOT-LEAK',
    CLAUDE_MODEL: 'claude-sonnet-4-6',
    ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
    ACCESS_AUD: 'test-aud',
    ALLOWED_ORIGINS: 'https://arcdefensereport.com',
    __verifyJwt: () => ({ email: 'raf@arc.test' }),
    DB: {
      prepare(sql) {
        return {
          bind: (...args) => ({
            first: async () => { const st = db.prepare(sql); return st.columns().length ? (st.get(...args) ?? null) : (st.run(...args), null); },
            run: async () => { db.prepare(sql).run(...args); return { success: true }; },
          }),
        };
      },
    },
    ...overrides,
  };
}

function stubProviders(onCall) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    onCall({ url, init });
    if (url.includes('api.anthropic.com')) {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'CLAUDE-OUTPUT' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'GEMINI-OUTPUT' }] }, finishReason: 'STOP' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected fetch: ' + url);
  };
  return () => { globalThis.fetch = original; };
}

const call = (env, body, headers = {}) => handleRequest(
  new Request('https://arcdefensereport.com/ai/run', {
    method: 'POST',
    headers: { 'Cf-Access-Jwt-Assertion': 'ok', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }), env);

test('every task in the policy routes to exactly one provider', () => {
  const providers = new Set(Object.values(TASK_POLICY).map(r => r.provider));
  assert.deepEqual([...providers].sort(), ['claude', 'gemini']);
});

test('only motions and the final report run on Claude', () => {
  const claude = Object.keys(TASK_POLICY).filter(t => TASK_POLICY[t].provider === 'claude').sort();
  assert.deepEqual(claude, ['motion.draft', 'motion.revise', 'report.final.draft', 'report.final.revise']);
});

test('every other module task runs on Gemini', () => {
  const gemini = Object.keys(TASK_POLICY).filter(t => TASK_POLICY[t].provider === 'gemini');
  assert.ok(gemini.length >= 15);
  ['evidence.extract', 'video.audit', 'custody.analyze', 'oui.analyze', 'notebook.query', 'board.command']
    .forEach(t => assert.equal(TASK_POLICY[t].provider, 'gemini', t));
});

test('a report task reaches Anthropic and never Google', async () => {
  const seen = [];
  const restore = stubProviders(c => seen.push(c.url));
  try {
    const res = await call(makeEnv(), { task: 'report.final.draft', payload: { system: 's', prompt: 'p' } });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.provider, 'claude');
    assert.equal(body.model, 'claude-sonnet-4-6');
    assert.equal(body.text, 'CLAUDE-OUTPUT');
    assert.ok(seen.every(u => u.includes('api.anthropic.com')));
  } finally { restore(); }
});

test('an evidence task reaches Google and never Anthropic', async () => {
  const seen = [];
  const restore = stubProviders(c => seen.push(c.url));
  try {
    const res = await call(makeEnv(), { task: 'evidence.extract', payload: { prompt: 'p' } });
    const body = await res.json();
    assert.equal(body.provider, 'gemini');
    assert.equal(body.model, 'gemini-3.6-flash');
    assert.ok(seen.every(u => u.includes('generativelanguage.googleapis.com')));
  } finally { restore(); }
});

test('a module cannot choose its own provider', async () => {
  const restore = stubProviders(() => { throw new Error('should not reach a provider'); });
  try {
    const res = await call(makeEnv(), { task: 'evidence.extract', provider: 'claude', payload: { prompt: 'p' } });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Provider is set by task/);
  } finally { restore(); }
});

test('a module cannot pass a raw model ID', async () => {
  const restore = stubProviders(() => { throw new Error('should not reach a provider'); });
  try {
    const res = await call(makeEnv(), { task: 'evidence.extract', model: 'gemini-3.1-pro-preview', payload: {} });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Model IDs are set by the gateway/);
  } finally { restore(); }
});

test('an unknown task is refused rather than defaulted', async () => {
  const restore = stubProviders(() => { throw new Error('should not reach a provider'); });
  try {
    const res = await call(makeEnv(), { task: 'something.new', payload: {} });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Unknown task/);
  } finally { restore(); }
});

test('role gating blocks an investigator from drafting a motion', async () => {
  const restore = stubProviders(() => { throw new Error('should not reach a provider'); });
  try {
    const res = await call(makeEnv({ role: 'investigator' }), { task: 'motion.draft', payload: { prompt: 'p' } });
    assert.equal(res.status, 403);
  } finally { restore(); }
});

test('an investigator may draft the final report', async () => {
  const restore = stubProviders(() => {});
  try {
    const res = await call(makeEnv({ role: 'investigator' }), { task: 'report.final.draft', payload: { prompt: 'p' } });
    assert.equal(res.status, 200);
  } finally { restore(); }
});

test('no provider key appears in any gateway response', async () => {
  const restore = stubProviders(() => {});
  try {
    for (const task of ['report.final.draft', 'evidence.extract']) {
      const res = await call(makeEnv(), { task, payload: { prompt: 'p' } });
      const raw = await res.text();
      assert.ok(!raw.includes('sk-ant-test-key'), task + ' leaked the Claude key');
      assert.ok(!raw.includes('gemini-test-key'), task + ' leaked the Gemini key');
    }
  } finally { restore(); }
});

test('a retired Gemini model walks the ladder', async () => {
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    seen.push(url);
    if (url.includes('gemini-3.6-flash')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const res = await call(makeEnv(), { task: 'evidence.extract', payload: { prompt: 'p' } });
    const body = await res.json();
    assert.equal(body.model, 'gemini-2.5-flash');
    assert.equal(seen.length, 2);
  } finally { globalThis.fetch = original; }
});

test('a failed provider call is logged as not ok', async () => {
  const env = makeEnv();
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('upstream down', { status: 500 });
  try {
    const res = await call(env, { task: 'evidence.extract', payload: { prompt: 'p' } });
    assert.equal(res.status, 502);
    const logged = env.db.prepare('SELECT * FROM provider_log').get();
    assert.ok(logged, 'the failure was recorded against the real schema');
    assert.equal(logged.ok, 0);
    assert.equal(logged.provider, 'gemini');
  } finally { globalThis.fetch = original; }
});

/* ------------------------------------------------- final report writer ----- */

function bootWriter({ facts = [], findings = [], reply }) {
  const win = { console, JSON, Promise, Date, String, Number, Array, Object, RegExp, Error };
  win.window = win;
  win.ARCLink = { activeCaseId: () => 'c1', get: () => ({ caseId: 'c1', clientName: 'Jane Roe', docket: '2584CR00681' }) };
  win.ARCBridge = {
    getActiveCase: () => ({ caseId: 'c1', clientName: 'Jane Roe' }),
    getApprovedFacts: () => facts,
    getApprovedFindings: () => findings,
  };
  win.lastTask = null;
  win.ARCAI = {
    run: (task, payload) => { win.lastTask = task; return Promise.resolve(reply); },
  };
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(new URL('./arc_final_report_writer.js', import.meta.url), 'utf8'), win);
  return win;
}

const FACT = { id: 'f1', text: 'The sequential record shows a single-channel sample terminating as REFUSAL.', source: 'OAT record p.4', approvedBy: 'R. Faria' };

test('the report writer refuses when nothing is approved', async () => {
  const win = bootWriter({ reply: '{}' });
  await assert.rejects(win.ARCFinalReport.draft({ caseId: 'c1' }), /Nothing in this case has been approved/);
});

test('the report writer runs on the Claude task, not a Gemini one', async () => {
  const win = bootWriter({
    facts: [FACT],
    reply: JSON.stringify({ sections: { summary: 'The record shows a REFUSAL result. [FACT:f1]' }, unsupported: [], notes: '' }),
  });
  await win.ARCFinalReport.draft({ caseId: 'c1' });
  assert.equal(win.lastTask, 'report.final.draft');
});

test('a draft citing a fact that does not exist is discarded whole', async () => {
  const win = bootWriter({
    facts: [FACT],
    reply: JSON.stringify({ sections: { summary: 'The defendant was cooperative. [FACT:f99]' }, unsupported: [] }),
  });
  await assert.rejects(win.ARCFinalReport.draft({ caseId: 'c1' }), /cited material that is not in the approved record \(FACT:f99\)/);
});

test('untagged factual paragraphs are flagged, not silently accepted', async () => {
  const long = 'The officer arrived at the scene and conducted a lengthy series of observations over many minutes.';
  const win = bootWriter({
    facts: [FACT],
    reply: JSON.stringify({ sections: { summary: 'The record shows a REFUSAL. [FACT:f1]', investigation: long }, unsupported: [] }),
  });
  const out = await win.ARCFinalReport.draft({ caseId: 'c1' });
  assert.equal(out.warnings.length, 1);
  assert.match(out.warnings[0], /carry no source tag/);
});

test('the refusal line is not flagged as untagged', async () => {
  const win = bootWriter({
    facts: [FACT],
    reply: JSON.stringify({
      sections: {
        summary: 'The record shows a REFUSAL. [FACT:f1]',
        discrepancies: 'The approved record does not contain material for this section.',
      },
      unsupported: ['discrepancies'],
    }),
  });
  const out = await win.ARCFinalReport.draft({ caseId: 'c1' });
  assert.ok(!out.warnings.some(w => /no source tag/.test(w)));
  assert.deepEqual(Array.from(out.unsupported), ['discrepancies']);
});

test('the approved record given to the model contains only approved material', () => {
  const win = bootWriter({ facts: [FACT], reply: '{}' });
  const record = win.ARCFinalReport._buildRecord([FACT], [], { clientName: 'Jane Roe', docket: '2584CR00681' });
  assert.match(record, /\[FACT:f1\]/);
  assert.match(record, /OAT record p\.4/);
  assert.match(record, /approved by: R\. Faria/);
  assert.match(record, /APPROVED FINDINGS\n {2}\(none\)/);
});

test('malformed model output stages nothing', async () => {
  const win = bootWriter({ facts: [FACT], reply: 'here is your report, sure thing' });
  await assert.rejects(win.ARCFinalReport.draft({ caseId: 'c1' }), /malformed output. Nothing was staged/);
});

test('a revision that reaches outside the record leaves the section unchanged', async () => {
  const win = bootWriter({
    facts: [FACT],
    reply: JSON.stringify({ sections: { summary: 'New text. [FACT:f42]' } }),
  });
  await assert.rejects(
    win.ARCFinalReport.revise({ caseId: 'c1', section: 'summary', current: 'old', instruction: 'shorten it' }),
    /left unchanged/
  );
});
