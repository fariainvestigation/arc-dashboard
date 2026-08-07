// Minimal D1 + R2 emulation so the Worker code under test is the code that ships.
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class D1Prepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args.map(a => (a === undefined ? null : a)); return this; }
  #stmt() { return this.db.prepare(this.sql); }
  async first() {
    const s = this.#stmt();
    return s.columns().length ? (s.get(...this.args) ?? null) : (s.run(...this.args), null);
  }
  async all() {
    const s = this.#stmt();
    if (!s.columns().length) { s.run(...this.args); return { results: [], success: true }; }
    return { results: s.all(...this.args), success: true };
  }
  async run() { const s = this.#stmt(); s.run(...this.args); return { success: true }; }
}

export class FakeD1 {
  constructor(dbFile = ':memory:') {
    this.db = new DatabaseSync(dbFile);
    this.db.exec('PRAGMA foreign_keys = OFF'); // D1 default is off unless enabled
    const schema = fs.readFileSync(path.join(__dirname, '..', 'worker', 'schema.sql'), 'utf8');
    this.db.exec(schema);
  }
  prepare(sql) { return new D1Prepared(this.db, sql); }
  async batch(stmts) { return Promise.all(stmts.map(s => s.run())); }
}

export class FakeR2 {
  constructor() { this.store = new Map(); }
  async put(key, value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, bytes);
    return { key, size: bytes.length };
  }
  async get(key) {
    if (!this.store.has(key)) return null;
    const bytes = this.store.get(key);
    return {
      key,
      body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }
  async delete(key) { this.store.delete(key); }
}

/** Build a test env. `identities` maps a token string to an Access identity. */
export function makeEnv(identities = {}) {
  return {
    DB: new FakeD1(),
    FILES: new FakeR2(),
    ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
    ACCESS_AUD: 'test-aud',
    ALLOWED_ORIGINS: 'https://arcdefensereport.com',
    COURTLISTENER_API_KEY: 'cl-test-secret-DO-NOT-LEAK',
    ANTHROPIC_API_KEY: 'sk-ant-test-secret-DO-NOT-LEAK',
    CLAUDE_MODEL: 'claude-sonnet-4-6',
    __verifyJwt: token => {
      if (!identities[token]) throw Object.assign(new Error('Access token invalid'), { status: 401 });
      return identities[token];
    },
  };
}

/** Issue a request against the Worker with an Access token. */
export function req(handler, env, method, url, { token = 'valid', body, headers = {}, raw } = {}) {
  const init = { method, headers: { 'Cf-Access-Jwt-Assertion': token, ...headers } };
  if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  if (raw !== undefined) { init.body = raw; init.headers['content-length'] = String(raw.length); }
  return handler(new Request('https://arcdefensereport.com' + url, init), env);
}

export async function jsonOf(res) {
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { _text: t }; }
}

/** Seed users and case assignments. */
export async function seedUser(env, email, role, cases = []) {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT OR REPLACE INTO legal_users (email, name, role, status, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .bind(email, email.split('@')[0], role, 'active', now, now).run();
  for (const c of cases) {
    await env.DB.prepare('INSERT OR REPLACE INTO case_assignments (case_id, email, assigned_role, assigned_at) VALUES (?,?,?,?)')
      .bind(c, email, role, now).run();
  }
}

/** Install a fetch stub so no test ever touches the real network. */
export function stubFetch(routes) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        const r = await handler(url, init);
        return new Response(JSON.stringify(r.body ?? r), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
      }
    }
    throw new Error('Unexpected outbound fetch in test: ' + url);
  };
  globalThis.fetch.__original = original;
  return () => { globalThis.fetch = original; };
}
